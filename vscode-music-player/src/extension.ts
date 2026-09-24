/**
 * 扩展入口。
 *
 * 组装顺序：凭据 → HTTP 客户端（带 WBI 与限流）→ 媒体代理 → 音频流水线 →
 * 播放服务 → 侧边栏视图。媒体代理必须在注册视图之前起来，因为 CSP 里要写死
 * 它的 origin，bootstrap 里也要带上端口与 token。
 *
 * 所有需要释放的东西都挂到 `context.subscriptions`，保证重载窗口时不残留监听
 * 端口与内存里的 26MB 级音频缓冲。
 */

import * as vscode from 'vscode';

import { BilibiliApi } from './bilibili/api';
import { BilibiliClient } from './bilibili/client';
import { toBilibiliError } from './bilibili/errors';
import { toFavoriteContentsView, collectRemainingPages, type FavoriteEntry } from './bilibili/favorites';
import { getUserId } from './bilibili/cookies';
import { WbiKeyStore, type WbiKeys } from './bilibili/wbi';
import { QrLoginError, QrLoginFlow, svgToDataUrl } from './auth/qrLogin';
import { AudioPipeline } from './audio/pipeline';
import { MediaStore } from './media/mediaStore';
import { startMediaProxy, type RunningMediaProxy } from './media/proxyServer';
import { PlayerService } from './player/playerService';
import { PlaybackSampler } from './playbackSampler';
import {
  DEFAULT_QUALITY,
  type AccountUser,
  type BootstrapPayload,
  type FavoriteFolderView,
  type FavoriteMembershipView,
  type HostToWebview,
  type PlayMode,
  type SidebarTab,
  type TrackSummary,
} from './protocol';
import { runSidebarPlaybackSelfTest, writeSelfTestReport } from './selftest';
import { SessionStore } from './state/session';
import { coerceSetting, isSettingsKey, readSettings } from './state/settings';
import { SidebarViewProvider } from './views/sidebarView';
import { createFileLogger, createOutputLogger } from './util/outputLog';
import { createTeeLogger, type Logger } from './util/log';
import { stripHtmlTags, parseDurationText } from './bilibili/types';

const VIEW_ID = 'musicPlayer.sidebar';
const CONFIG_SECTION = 'musicPlayer';
/** 播放模式的中文名（提示与状态显示用）。 */
const PLAY_MODE_LABELS: Record<string, string> = {
  sequential: '顺序播放',
  'repeat-all': '列表循环',
  'repeat-one': '单曲循环',
  shuffle: '随机播放',
};
/**
 * 自检用曲目。
 *
 * 刻意写死一个稳定的公开视频，而不是现搜一个：搜索接口对未登录的高频调用会软
 * 风控（返回空结果），自检不该因此变得不可靠。
 */
const SELFTEST_TRACK: TrackSummary = {
  bvid: 'BV1Vmem6LEUe',
  title: '自检用曲目（Summer）',
  author: '久石让',
  cover: '',
  durationSeconds: 0,
  pageCount: 1,
};

class MusicPlayerApp implements vscode.Disposable {
  private readonly output: vscode.OutputChannel;
  private logger: Logger;
  private readonly session: SessionStore;
  private readonly mediaStore = new MediaStore();
  private readonly sampler = new PlaybackSampler();
  private readonly disposables: vscode.Disposable[] = [];

  private client!: BilibiliClient;
  private wbiKeys!: WbiKeyStore;
  private api!: BilibiliApi;
  private proxy: RunningMediaProxy | null = null;
  private pipeline!: AudioPipeline;
  private player!: PlayerService;
  private view: SidebarViewProvider | null = null;
  private statusBar: vscode.StatusBarItem | null = null;
  private selftestRunning = false;
  /** 正在进行的扫码登录（同一时刻只允许一个）。 */
  private loginFlow: QrLoginFlow | null = null;
  /** 当前登录用户信息（未登录为 null）。 */
  private userInfo: AccountUser | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.output = vscode.window.createOutputChannel('音乐播放器');
    this.logger = this.makeLogger();
    this.session = new SessionStore(context.secrets, undefined, this.logger);
  }

  /** 自检模式（环境变量 `VMP_SELFTEST=1`）下把日志同时写到文件，便于无人值守收集。 */
  private makeLogger(): Logger {
    const level = this.logLevel();
    const toOutput = createOutputLogger(this.output, level);
    if (!this.selftestMode()) return toOutput;
    return createTeeLogger(
      toOutput,
      createFileLogger(this.selftestFile('extension-log.txt'), 'debug'),
    );
  }

  private selftestMode(): boolean {
    return process.env['VMP_SELFTEST'] === '1';
  }

  private selftestFile(name: string): string {
    return vscode.Uri.joinPath(this.context.globalStorageUri, name).fsPath;
  }

  /* ------------------------------------------------------------ 配置读取 */

  private config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(CONFIG_SECTION);
  }

  private logLevel(): 'off' | 'info' | 'debug' {
    const raw = this.config().get<string>('logLevel', 'info');
    return raw === 'off' || raw === 'debug' ? raw : 'info';
  }

  private quality(): number {
    const raw = this.config().get<number>('audioQuality', DEFAULT_QUALITY);
    return Number.isFinite(raw) ? raw : DEFAULT_QUALITY;
  }

  private cacheEnabled(): boolean {
    return this.config().get<boolean>('cache.enabled', true);
  }

  private cacheDir(): string | null {
    if (!this.cacheEnabled()) return null;
    return vscode.Uri.joinPath(this.context.globalStorageUri, 'music-cache').fsPath;
  }

  /* ------------------------------------------------------------------ 启动 */

  async start(): Promise<void> {
    await this.session.load();
    this.logger.info(`扩展启动（VS Code ${vscode.version}，日志级别 ${this.logLevel()}）`);

    this.client = new BilibiliClient({
      readCookies: () => this.session.cookies,
      logger: this.logger,
      minIntervalMs: () => this.config().get<number>('requestIntervalMs', 350),
    });

    this.wbiKeys = new WbiKeyStore({
      logger: this.logger,
      read: () => this.context.globalState.get<WbiKeys>('musicPlayer.wbiKeys') ?? null,
      write: (keys) => {
        void this.context.globalState.update('musicPlayer.wbiKeys', keys);
      },
      load: async () => {
        const nav = await this.client.get<{ wbi_img: { img_url: string; sub_url: string } }>({
          endpoint: '/x/web-interface/nav',
          allowCodes: [-101],
        });
        return { imgUrl: nav.wbi_img.img_url, subUrl: nav.wbi_img.sub_url };
      },
    });

    this.api = new BilibiliApi(this.client, this.wbiKeys, this.logger);

    this.proxy = await startMediaProxy({ store: this.mediaStore, logger: this.logger });
    this.disposables.push({ dispose: () => void this.proxy?.close() });

    this.pipeline = new AudioPipeline({
      api: this.api,
      client: this.client,
      logger: this.logger,
      cacheDir: this.cacheDir(),
      cacheMaxBytes: Math.max(50, this.config().get<number>('cache.maxMB', 500)) * 1024 * 1024,
    });

    this.player = new PlayerService({
      api: this.api,
      pipeline: this.pipeline,
      store: this.mediaStore,
      proxyUrl: (path) => this.proxyUrl(path),
      logger: this.logger,
      getQuality: () => this.quality(),
      getVolume: () => this.config().get<number>('volume', 0.8),
      onState: (state) => {
        this.post({
          type: 'playerState',
          track: state.track,
          playing: state.playing,
          position: state.position,
          duration: state.duration,
          muted: state.muted,
        });
        this.updateStatusBar();
      },
      onPrepare: (stage, message, percent) => {
        this.post({ type: 'prepare', stage, message, percent });
      },
      onQueue: (state, index) => {
        this.post({
          type: 'queue.state',
          items: state.items,
          index,
          mode: state.mode,
        });
      },
    });

    // 初始播放模式来自设置（顺序 / 列表循环 / 单曲循环 / 随机）。
    this.player.setPlayMode(this.config().get<PlayMode>('defaultPlayMode', 'sequential'));

    // 后台补齐设备指纹与登录态，失败不影响使用。
    void this.refreshLoginState();

    this.view = new SidebarViewProvider({
      extensionUri: this.context.extensionUri,
      proxyOrigin: this.proxy.origin,
      getBootstrap: () => this.bootstrap(),
      logger: this.logger,
      onMessage: (message) => void this.handleWebviewMessage(message),
    });

    this.disposables.push(
      vscode.window.registerWebviewViewProvider(VIEW_ID, this.view, {
        webviewOptions: {
          // 侧边栏被隐藏时保留 webview 上下文，否则正在播放的 <audio> 会被销毁。
          retainContextWhenHidden: true,
        },
      }),
    );

    this.registerCommands();
    this.setupStatusBar();

    this.disposables.push(
      vscode.window.registerUriHandler({
        handleUri: (uri) => this.handleUri(uri),
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration(CONFIG_SECTION)) return;
        this.logger = this.makeLogger();
        this.logger.info('配置已更新');
        // 在设置界面（或 settings.json）里改了什么，侧边栏里的读数要跟着变。
        this.postSettings();
        void this.postCacheInfo();
      }),
    );

    this.context.subscriptions.push(...this.disposables);

    if (this.selftestMode()) {
      this.logger.info('检测到 VMP_SELFTEST=1：先把视图拉到前台，再自动执行自检');
      void (async () => {
        try {
          await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
        } catch (error) {
          this.logger.warn('聚焦播放器视图失败', error);
        }
        await this.runSelfTest();
      })();
    }

    if (process.env['VMP_LOGIN_TEST'] === '1') {
      // 自动化验证登录链路：宿主生成二维码 → 界面收到并回报。扫码那一步需要人。
      this.logger.info('检测到 VMP_LOGIN_TEST=1：自动发起扫码登录');
      void (async () => {
        try {
          await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
        } catch {
          /* 视图可能已经在前面 */
        }
        this.showTab('account');
        void this.startLogin();
      })();
    }

    if (process.env['VMP_SETTINGS_TEST'] === '1') {
      // 自动化验证「设置 → 界面 → 媒体元素」的往返：改完看界面回报的播放参数。
      this.logger.info('检测到 VMP_SETTINGS_TEST=1：自动改一次音量与倍速');
      void (async () => {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        await this.applySetting('volume', 0.35);
        await this.applySetting('playbackRate', 1.5);
      })();
    }
  }

  dispose(): void {
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
    this.output.dispose();
  }

  /* ------------------------------------------------------------ 视图通信 */

  private bootstrap(): BootstrapPayload {
    return {
      proxyPort: this.proxy?.port ?? 0,
      proxyToken: this.proxy?.token ?? '',
      quality: this.quality(),
      cacheEnabled: this.cacheEnabled(),
      loggedIn: this.session.isLoggedIn,
      version: this.context.extension.packageJSON.version as string,
    };
  }

  private proxyUrl(path: string): string {
    if (this.proxy === null) throw new Error('媒体代理尚未启动');
    return this.proxy.url(path);
  }

  /**
   * 把 B 站图片转成本地代理地址。
   *
   * 两个原因：一是 CSP 里 `img-src` 只放行了代理与 webview 自身（不给 `*.hdslb.com`
   * 开口子）；二是图片 CDN 有防盗链，走宿主带 Referer 取更稳。同一个地址只登记一次。
   */
  private imageCache = new Map<string, string>();

  private proxiedImage(url: string | undefined): string {
    const source = (url ?? '').trim();
    if (source === '') return '';
    const absolute = source.startsWith('//')
      ? `https:${source}`
      : source.startsWith('http')
        ? source
        : '';
    if (absolute === '') return '';
    const cached = this.imageCache.get(absolute);
    if (cached !== undefined) return cached;

    const id = this.mediaStore.register({
      kind: 'image',
      upstreamUrl: absolute,
      // 真实类型会被上游响应的 content-type 覆盖。
      contentType: 'image/jpeg',
      label: absolute.slice(0, 120),
      ttlMs: 6 * 60 * 60 * 1000,
      priority: 1,
    });
    const proxied = this.proxy?.url(`/img/${id}`) ?? '';
    this.imageCache.set(absolute, proxied);
    return proxied;
  }

  private post(message: HostToWebview): boolean {
    return this.view?.post(message) ?? false;
  }

  private toast(level: 'info' | 'warn' | 'error', message: string): void {
    this.post({ type: 'toast', level, message });
    if (level === 'error') this.logger.error(message);
    else if (level === 'warn') this.logger.warn(message);
    else this.logger.info(message);
  }

  private async handleWebviewMessage(message: {
    type: string;
    [key: string]: unknown;
  }): Promise<void> {
    switch (message.type) {
      case 'ready': {
        this.logger.info('webview 已就绪', message['capabilities']);
        this.post({ type: 'bootstrap', ...this.bootstrap() });
        this.broadcastAuth();
        this.postSettings();
        void this.postCacheInfo();
        return;
      }
      case 'log': {
        const text = String(message['message'] ?? '');
        const level = String(message['level'] ?? 'debug');
        if (level === 'warn') this.logger.warn(`[webview] ${text}`);
        else if (level === 'error') this.logger.error(`[webview] ${text}`);
        else this.logger.debug(`[webview] ${text}`);
        return;
      }
      case 'search': {
        await this.runSearch(String(message['keyword'] ?? ''), Number(message['page'] ?? 1));
        return;
      }
      case 'prepareTrack': {
        const track = message['track'] as TrackSummary | undefined;
        if (track !== undefined && typeof track.bvid === 'string' && track.bvid !== '') {
          // 悬停预取：不阻塞 UI，失败只记日志。
          void this.player.prepare(track);
        }
        return;
      }
      case 'play': {
        const queue = Array.isArray(message['queue'])
          ? (message['queue'] as TrackSummary[]).filter(
              (item): item is TrackSummary => typeof item?.bvid === 'string' && item.bvid !== '',
            )
          : null;
        if (queue !== null && queue.length > 0) {
          // 列表里点歌：整份列表接管为播放队列，并从这一首开始。
          const index = Math.min(Math.max(0, Number(message['index'] ?? 0)), queue.length - 1);
          this.player.adoptQueue(queue, index);
        }
        await this.playTrack(message['track'] as TrackSummary);
        return;
      }
      case 'player.next': {
        await this.advanceBy(1, false);
        return;
      }
      case 'player.previous': {
        await this.advanceBy(-1, false);
        return;
      }
      case 'player.ended': {
        // 自然放完：单曲循环会重播，否则按队列往后走。
        await this.advanceBy(1, true);
        return;
      }
      case 'player.setMode': {
        const mode = String(message['mode'] ?? 'sequential') as PlayMode;
        this.player.setPlayMode(mode);
        this.toast('info', `播放模式：${PLAY_MODE_LABELS[mode] ?? mode}`);
        return;
      }
      case 'queue.enqueue': {
        const track = message['track'] as TrackSummary | undefined;
        if (track && typeof track.bvid === 'string') {
          this.player.enqueueTrack(track);
          this.toast('info', `已加入队列：${track.title}`);
        }
        return;
      }
      case 'queue.remove': {
        this.player.removeQueueAt(Number(message['index'] ?? -1));
        return;
      }
      case 'queue.move': {
        this.player.moveInQueue(Number(message['from'] ?? -1), Number(message['to'] ?? -1));
        return;
      }
      case 'queue.clear': {
        this.player.clearQueue();
        return;
      }
      case 'queue.playAt': {
        const index = Number(message['index'] ?? -1);
        const track = this.player.trackAt(index);
        if (track !== null) {
          this.player.focusQueueIndex(index);
          await this.playTrack(track);
        }
        return;
      }
      case 'report': {
        const muted = message['muted'] === true;
        this.sampler.record(
          Boolean(message['playing']),
          Number(message['position'] ?? 0),
        );
        if (muted && !this.player.muted) {
          // 这条必须让用户看见：时钟在走却没声音，多半就是被自动播放策略拦了。
          this.logger.warn(
            '播放被自动播放策略拦下，已退化为静音播放；点击播放器区域任意位置即可恢复声音',
          );
        }
        this.player.report({
          playing: Boolean(message['playing']),
          position: Number(message['position'] ?? 0),
          duration: Number(message['duration'] ?? 0),
          muted,
          ...(typeof message['volume'] === 'number' ? { volume: message['volume'] } : {}),
        });
        const error = message['error'];
        if (typeof error === 'string' && error !== '') {
          this.toast('error', `播放失败：${error}`);
        }
        return;
      }
      case 'toggle': {
        this.player.setPlaying(!this.player.current.playing);
        return;
      }
      case 'seek': {
        this.player.seek(Number(message['position'] ?? 0));
        return;
      }
      case 'stop': {
        this.player.stop();
        this.sampler.reset();
        return;
      }
      case 'auth.start': {
        void this.startLogin();
        return;
      }
      case 'auth.cancel': {
        this.loginFlow?.cancel();
        return;
      }
      case 'auth.logout': {
        void this.logout();
        return;
      }
      case 'favorites.list': {
        await this.loadFavoriteFolders();
        return;
      }
      case 'favorites.open': {
        await this.loadFavoriteContents({
          mediaId: Number(message['mediaId'] ?? 0),
          page: Number(message['page'] ?? 1),
          ...(typeof message['keyword'] === 'string' ? { keyword: message['keyword'] } : {}),
        });
        return;
      }
      case 'favorites.create': {
        const title = String(message['title'] ?? '').trim();
        if (title === '') {
          this.toast('warn', '收藏夹名称不能为空');
          return;
        }
        await this.createFavoriteFolder(title, message['privacy'] === 1 ? 1 : 0);
        return;
      }
      case 'favorites.removeFolder': {
        await this.removeFavoriteFolder(
          Number(message['mediaId'] ?? 0),
          String(message['title'] ?? ''),
        );
        return;
      }
      case 'favorites.removeResources': {
        const bvids = Array.isArray(message['bvids'])
          ? (message['bvids'] as unknown[]).filter((item): item is string => typeof item === 'string')
          : [];
        await this.removeFavoriteResources(Number(message['mediaId'] ?? 0), bvids);
        return;
      }
      case 'favorites.membership': {
        await this.loadMembership(String(message['bvid'] ?? ''));
        return;
      }
      case 'favorites.deal': {
        const toStringArray = (value: unknown): string[] =>
          Array.isArray(value) ? value.map((item) => String(item)) : [];
        await this.dealFavorite(
          String(message['bvid'] ?? ''),
          toStringArray(message['addIds']),
          toStringArray(message['delIds']),
        );
        return;
      }
      case 'favorites.playAll': {
        await this.playFavoriteFolder(Number(message['mediaId'] ?? 0));
        return;
      }
      case 'cache.stats': {
        await this.postCacheInfo();
        return;
      }
      case 'cache.clear': {
        await this.clearAudioCache();
        return;
      }
      case 'settings.get': {
        this.postSettings();
        await this.postCacheInfo();
        return;
      }
      case 'settings.set': {
        await this.applySetting(String(message['key'] ?? ''), message['value']);
        return;
      }
      case 'dialog.confirm': {
        const id = String(message['id'] ?? '');
        const confirmed = await this.confirmDestructive(
          String(message['message'] ?? '确定继续吗？'),
          typeof message['detail'] === 'string' ? message['detail'] : undefined,
        );
        this.post({ type: 'dialog.result', id, confirmed });
        return;
      }
      default:
        return;
    }
  }

  /* ---------------------------------------------------------------- 业务 */

  private async refreshLoginState(): Promise<void> {
    try {
      const buvid = await this.api.fetchBuvid();
      if (buvid !== null) await this.session.setBuvid(buvid.b_3, buvid.b_4);
    } catch (error) {
      this.logger.warn('获取设备指纹失败（不影响播放）', toBilibiliError(error).message);
    }
    await this.loadUserInfo();
  }

  /** 拉取登录用户信息；凭据失效时顺手清掉它。 */
  private async loadUserInfo(): Promise<void> {
    if (!this.session.isLoggedIn) {
      this.userInfo = null;
      this.broadcastAuth();
      return;
    }
    try {
      const info = await this.api.getUserInfo();
      this.userInfo = { mid: info.mid, name: info.name, face: this.proxiedImage(info.face) };
      this.logger.info(`已登录：${info.name}（${info.mid}）`);
    } catch (error) {
      const normalized = toBilibiliError(error);
      if (normalized.kind === 'not-logged-in') {
        this.logger.warn('登录凭据已失效，已清除登录态（保留设备指纹）');
        await this.session.clearLogin();
        this.userInfo = null;
      } else {
        this.logger.warn('获取用户信息失败（不影响播放）', normalized.message);
      }
    }
    this.broadcastAuth();
  }

  /** 把登录态同步给 webview 与上下文键（菜单项靠 `musicPlayer.loggedIn` 切换）。 */
  private broadcastAuth(): void {
    const loggedIn = this.session.isLoggedIn;
    void vscode.commands.executeCommand('setContext', 'musicPlayer.loggedIn', loggedIn);
    this.post({
      type: 'auth.state',
      loggedIn,
      user: loggedIn ? this.userInfo : null,
    });
  }

  private showTab(tab: SidebarTab): void {
    this.post({ type: 'command', command: 'showTab', tab });
  }

  /** 扫码登录：申请二维码 → 轮询 → 收下 cookie。 */
  async startLogin(): Promise<void> {
    if (this.session.isLoggedIn) {
      this.toast('info', '已经是登录状态');
      this.showTab('account');
      return;
    }
    if (this.loginFlow !== null) {
      // 已有流程在跑：把界面切到账户页即可。
      this.showTab('account');
      return;
    }

    await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    this.showTab('account');

    const flow = new QrLoginFlow({
      fetchRaw: (options) => this.client.fetchRaw(options),
      logger: this.logger,
    });
    this.loginFlow = flow;

    try {
      const cookies = await flow.run({
        onQrCode: (payload) => {
          this.logger.info(`登录二维码已生成（${payload.svg.length} 字节 SVG），已发送到界面`);
          this.post({ type: 'auth.qr', dataUrl: svgToDataUrl(payload.svg) });
        },
        onStatus: (status, message) => this.post({ type: 'auth.status', status, message }),
      });
      await this.session.setCookies(cookies);
      this.logger.info('扫码登录成功');
      this.post({ type: 'auth.status', status: 'success', message: '登录成功' });
      await this.loadUserInfo();
      this.toast('info', '登录成功');
    } catch (error) {
      const kind = error instanceof QrLoginError ? error.kind : 'failed';
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`扫码登录未完成（${kind}）：${message}`);
      this.post({
        type: 'auth.status',
        status: kind === 'cancelled' ? 'cancelled' : kind === 'expired' ? 'expired' : 'error',
        message,
      });
    } finally {
      this.loginFlow = null;
    }
  }

  async logout(): Promise<void> {
    this.loginFlow?.cancel();
    this.loginFlow = null;
    // 只清登录凭据，保留设备指纹（它不是账号信息）。
    await this.session.clearLogin();
    this.userInfo = null;
    this.broadcastAuth();
    this.toast('info', '已退出登录');
  }

  private async runSearch(keyword: string, page: number): Promise<void> {
    const trimmed = keyword.trim();
    if (trimmed === '') return;
    try {
      this.logger.info(`搜索「${trimmed}」第 ${page} 页`);
      const result = await this.api.searchVideos({ keyword: trimmed, page });
      const items: TrackSummary[] = result.items.map((item) => ({
        bvid: item.bvid ?? '',
        title: stripHtmlTags(item.title),
        author: item.author ?? '',
        cover: this.proxiedImage(item.pic),
        durationSeconds: parseDurationText(item.duration) ?? 0,
        pageCount: 0,
      }));
      this.post({
        type: 'searchResult',
        view: { keyword: trimmed, page, numPages: result.numPages, items },
      });
    } catch (error) {
      this.toast('error', `搜索失败：${toBilibiliError(error).userMessage}`);
    }
  }

  private async playTrack(track: TrackSummary | undefined): Promise<void> {
    if (!track || typeof track.bvid !== 'string' || track.bvid === '') {
      this.toast('error', '无效的曲目');
      return;
    }
    // 先让界面停掉当前声音并进入等待态，再去做可能耗时数秒的下载与解码。
    this.post({ type: 'player.loading', track });
    this.post({ type: 'prepare', stage: 'queued', message: '正在准备…', percent: null });
    try {
      // 流式起播会在音频刚够开头时就把地址回调过来（约 1～2 秒），
      // 整段物化则在全部解完后回调——两条路都从这里发 playerSource。
      await this.player.play(track, (url) => {
        this.post({ type: 'playerSource', track, url, resumeAt: 0 });
      });
    } catch (error) {
      const normalized = toBilibiliError(error);
      if (normalized.kind === 'aborted') {
        // 用户点了别的歌：这是预期内的中止，不该弹错误。
        this.logger.debug('播放请求已被新的请求取代');
        return;
      }
      this.toast('error', `无法播放：${normalized.userMessage}`);
    }
  }

  /* ---------------------------------------------------------------- 收藏夹 */

  /** 收藏夹只对登录用户有意义：mid 优先用 myinfo 的，其次用 cookie 里的 DedeUserID。 */
  private favoritesMid(): number | null {
    return this.userInfo?.mid ?? getUserId(this.session.cookies);
  }

  /** 需要登录的操作统一走这里：未登录就提示并切到账户页。 */
  private requireLogin(): number | null {
    const mid = this.favoritesMid();
    if (!this.session.isLoggedIn || mid === null) {
      this.toast('warn', '收藏夹需要先扫码登录');
      this.showTab('account');
      return null;
    }
    return mid;
  }

  /** 当前打开的收藏夹（宿主侧的已加载内容，「播放歌单」直接用这份）。 */
  private favoriteView: {
    mediaId: number;
    title: string;
    items: TrackSummary[];
    page: number;
    hasMore: boolean;
  } | null = null;

  private favoriteEntryToTrack(entry: FavoriteEntry): TrackSummary {
    return {
      bvid: entry.bvid,
      title: entry.title,
      author: entry.upperName,
      cover: this.proxiedImage(entry.cover),
      durationSeconds: entry.durationSeconds,
      pageCount: entry.pageCount,
      ...(entry.invalid ? { invalid: true } : {}),
    };
  }

  private async loadFavoriteFolders(): Promise<void> {
    const mid = this.requireLogin();
    if (mid === null) return;
    this.post({ type: 'busy', what: 'favorites', on: true });
    try {
      const folders = await this.api.getFavoriteFolders({ mid });
      const items: FavoriteFolderView[] = folders.map((folder) => ({
        id: folder.id,
        title: folder.title,
        count: Number.isFinite(folder.media_count) ? folder.media_count : 0,
      }));
      this.logger.info(`收藏夹列表：${items.length} 个`);
      this.post({ type: 'favorites.folders', items });
    } catch (error) {
      this.toast('error', `读取收藏夹失败：${toBilibiliError(error).userMessage}`);
    } finally {
      this.post({ type: 'busy', what: 'favorites', on: false });
    }
  }

  private async loadFavoriteContents(options: {
    mediaId: number;
    page: number;
    keyword?: string;
  }): Promise<void> {
    if (this.requireLogin() === null) return;
    this.post({ type: 'busy', what: 'favorites', on: true });
    try {
      const page = await this.api.getFavoriteContents({
        mediaId: options.mediaId,
        page: options.page,
        ...(options.keyword === undefined || options.keyword === ''
          ? {}
          : { keyword: options.keyword, scope: 'this' as const }),
      });
      const view = toFavoriteContentsView(page);
      const items = view.entries.map((entry) => this.favoriteEntryToTrack(entry));
      // 记住当前这一夹的已加载内容：宿主是「播放歌单」的数据来源，不必让界面回传。
      if (options.page <= 1 || this.favoriteView?.mediaId !== options.mediaId) {
        this.favoriteView = {
          mediaId: options.mediaId,
          title: view.title,
          items,
          page: options.page,
          hasMore: view.hasMore,
        };
      } else {
        this.favoriteView = {
          ...this.favoriteView,
          items: [...this.favoriteView.items, ...items],
          page: options.page,
          hasMore: view.hasMore,
        };
      }
      this.logger.info('收藏夹内容', {
        mediaId: options.mediaId,
        page: options.page,
        title: view.title,
        total: view.total,
        items: view.entries.length,
        hasMore: view.hasMore,
      });
      this.post({
        type: 'favorites.contents',
        mediaId: options.mediaId,
        page: options.page,
        title: view.title,
        total: view.total,
        hasMore: view.hasMore,
        items,
      });
    } catch (error) {
      this.toast('error', `读取收藏夹内容失败：${toBilibiliError(error).userMessage}`);
    } finally {
      this.post({ type: 'busy', what: 'favorites', on: false });
    }
  }

  /**
   * 播放歌单：清空队列 → 把已加载的内容入队并立刻开播 → 剩余页在后台继续补进队列。
   *
   * 之所以先播已加载的：收藏夹可能有几百首、要翻十几页，等全部取完再出声太慢。
   */
  private async playFavoriteFolder(mediaId: number): Promise<void> {
    if (this.requireLogin() === null) return;
    const view = this.favoriteView;
    if (view === null || view.mediaId !== mediaId || view.items.length === 0) {
      this.toast('warn', '请先打开这个收藏夹（内容还没加载）');
      return;
    }

    this.post({ type: 'favorites.playAll.state', state: 'running', message: '正在准备歌单…', queued: 0 });
    // 队列由宿主接管：先清空，再用这一夹的内容作为播放队列。
    this.player.clearQueue();
    this.player.adoptQueue(view.items, 0);
    this.logger.info('播放歌单', { mediaId, title: view.title, first: view.items.length, hasMore: view.hasMore });

    const first = view.items[0];
    if (first !== undefined) await this.playTrack(first);

    if (!view.hasMore) {
      this.post({
        type: 'favorites.playAll.state',
        state: 'done',
        message: `已加入 ${view.items.length} 首`,
        queued: view.items.length,
      });
      return;
    }

    let queued = view.items.length;
    const result = await collectRemainingPages({
      startPage: view.page,
      hasMore: view.hasMore,
      fetchPage: async (page) => {
        const raw = await this.api.getFavoriteContents({ mediaId, page });
        return toFavoriteContentsView(raw);
      },
      onBatch: (entries) => {
        const tracks = entries.map((entry) => this.favoriteEntryToTrack(entry));
        this.player.appendQueue(tracks);
        queued += tracks.length;
        this.post({
          type: 'favorites.playAll.state',
          state: 'running',
          message: `正在加入队列…（已 ${queued} 首）`,
          queued,
        });
      },
      onError: (error) => {
        this.logger.warn('补齐收藏夹剩余页失败', toBilibiliError(error).message);
      },
    });
    // 刻意不改缓存里的 `hasMore`：再次点「播放歌单」时重新翻页才是正确的（这次只是
    // 把内容送进了队列，并没有改变「收藏夹还有多少页没加载」这个事实）。
    this.post({
      type: 'favorites.playAll.state',
      state: 'done',
      message: result.truncated
        ? `已加入 ${queued} 首（收藏夹过大，只取了前 ${result.pages} 页）`
        : `已加入 ${queued} 首`,
      queued,
    });
  }

  /** 原生模态确认框——破坏性操作不接受 webview 里的自绘确认。 */
  private async confirmDestructive(message: string, detail?: string): Promise<boolean> {
    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: true, ...(detail === undefined ? {} : { detail }) },
      '确认',
    );
    return choice === '确认';
  }

  private async createFavoriteFolder(title: string, privacy: 0 | 1): Promise<void> {
    if (this.requireLogin() === null) return;
    try {
      const created = await this.api.createFavoriteFolder({ title, privacy });
      this.toast('info', `已创建收藏夹「${created.title}」`);
      await this.loadFavoriteFolders();
    } catch (error) {
      this.toast('error', `创建收藏夹失败：${toBilibiliError(error).userMessage}`);
    }
  }

  private async removeFavoriteFolder(mediaId: number, title: string): Promise<void> {
    if (this.requireLogin() === null) return;
    const confirmed = await this.confirmDestructive(
      `确定删除收藏夹「${title}」吗？`,
      '收藏夹内的视频不会从 B 站删除，但该收藏夹本身会被移除，且无法撤销。',
    );
    if (!confirmed) return;
    try {
      await this.api.deleteFavoriteFolders([mediaId]);
      this.toast('info', `已删除收藏夹「${title}」`);
      await this.loadFavoriteFolders();
    } catch (error) {
      this.toast('error', `删除收藏夹失败：${toBilibiliError(error).userMessage}`);
    }
  }

  private async removeFavoriteResources(mediaId: number, bvids: string[]): Promise<void> {
    if (this.requireLogin() === null) return;
    if (bvids.length === 0) return;
    const confirmed = await this.confirmDestructive(
      `确定把选中的 ${bvids.length} 个视频移出这个收藏夹吗？`,
      '视频本身不会被删除，只是不再属于这个收藏夹。',
    );
    if (!confirmed) return;
    try {
      await this.api.removeFavoriteResources({ mediaId, bvids });
      this.toast('info', `已移出 ${bvids.length} 个视频`);
      await this.loadFavoriteContents({ mediaId, page: 1 });
      await this.loadFavoriteFolders();
    } catch (error) {
      this.toast('error', `移出失败：${toBilibiliError(error).userMessage}`);
    }
  }

  /** 查某个视频在哪些收藏夹里（「加入收藏夹」界面的勾选状态）。 */
  private async loadMembership(bvid: string): Promise<void> {
    const mid = this.requireLogin();
    if (mid === null) return;
    try {
      const folders = await this.api.getFavoriteFolders({ mid, bvid });
      const items: FavoriteMembershipView[] = folders.map((folder) => ({
        id: folder.id,
        title: folder.title,
        selected: folder.fav_state === 1,
      }));
      this.post({ type: 'favorites.membership', bvid, folders: items });
    } catch (error) {
      this.toast('error', `读取收藏状态失败：${toBilibiliError(error).userMessage}`);
    }
  }

  /** 把视频加入/移出若干收藏夹。 */
  private async dealFavorite(bvid: string, addIds: string[], delIds: string[]): Promise<void> {
    if (this.requireLogin() === null) return;
    if (addIds.length === 0 && delIds.length === 0) return;
    try {
      const result = await this.api.dealFavoriteForOneVideo({
        bvid,
        addToFavoriteIds: addIds,
        delInFavoriteIds: delIds,
      });
      const added = addIds.length > 0 ? `加入 ${addIds.length} 个` : '';
      const removed = delIds.length > 0 ? `移出 ${delIds.length} 个` : '';
      const summary = [added, removed].filter((part) => part !== '').join('、');
      this.toast('info', `${summary}收藏夹已生效${result.toast_msg ? `（${result.toast_msg}）` : ''}`);
      await this.loadMembership(bvid);
    } catch (error) {
      this.toast('error', `操作收藏夹失败：${toBilibiliError(error).userMessage}`);
    }
  }

  /** 队列前移/后移一格的副作用：换歌、原地重播，或停下。 */
  private async advanceBy(direction: 1 | -1, auto: boolean): Promise<void> {
    if (!auto && this.player.current.track === null) return;
    const decision = this.player.step(direction, { auto });
    if (decision.kind === 'stop') {
      this.player.setPlaying(false);
      this.logger.debug('队列已到末尾，停止播放');
      return;
    }
    if (decision.kind === 'replay') {
      const state = this.player.current;
      if (state.track === null || state.url === null) return;
      // 原地重播：复用已登记的媒体地址，不重新下载解码。
      this.post({ type: 'playerSource', track: state.track, url: state.url, resumeAt: 0 });
      return;
    }
    await this.playTrack(decision.track);
  }

  /* -------------------------------------------------------- 设置与缓存 */

  private cacheMaxBytes(): number {
    return Math.max(50, this.config().get<number>('cache.maxMB', 500)) * 1024 * 1024;
  }

  /** 把缓存占用与设置快照推给界面。 */
  private async postCacheInfo(): Promise<void> {
    const stats = await this.pipeline.cacheStats();
    const maxBytes = this.cacheMaxBytes();
    this.logger.debug('缓存占用', {
      files: stats.files,
      bytes: stats.bytes,
      maxBytes,
      enabled: this.cacheEnabled(),
    });
    this.post({
      type: 'cache.info',
      info: {
        files: stats.files,
        bytes: stats.bytes,
        maxBytes,
        dir: this.cacheDir() ?? '',
        enabled: this.cacheEnabled(),
      },
    });
  }

  private postSettings(): void {
    this.post({ type: 'settings.state', settings: readSettings(this.config()) });
  }

  /**
   * 清空磁盘缓存。
   *
   * 只清磁盘，**不动**内存里的媒体登记表——那里装着正在播放的那首，清掉会让播放
   * 立刻 404。（这一点之前是错的：命令面板的清理会把当前播放也一起弄坏。）
   */
  private async clearAudioCache(): Promise<void> {
    const stats = await this.pipeline.cacheStats();
    await this.pipeline.clearCache();
    this.logger.info(`已清空音频缓存（${stats.files} 个文件 / ${Math.round(stats.bytes / 1024 / 1024)}MB）`);
    this.toast('info', `已清空音频缓存，释放 ${formatBytes(stats.bytes)}`);
    await this.postCacheInfo();
  }

  /** 改一项设置：只允许白名单里的键，值也要过类型与范围校验。 */
  private async applySetting(key: string, raw: unknown): Promise<void> {
    if (!isSettingsKey(key)) {
      this.logger.warn(`拒绝写入未知设置项：${key}`);
      return;
    }
    const coerced = coerceSetting(key, raw);
    if (coerced === null) {
      this.toast('warn', `设置值不合法：${key}`);
      return;
    }
    await this.config().update(coerced.configKey, coerced.value, vscode.ConfigurationTarget.Global);
    this.logger.info(`设置已更新：${coerced.configKey} = ${String(coerced.value)}`);
    // 音量与倍速也通过 settings.state 回流，playerState 不再携带它们（避免旧消息覆盖新值）。
    this.postSettings();
    await this.postCacheInfo();
    if (key === 'showStatusBar') {
      this.applyStatusBarVisibility();
    }
  }

  /* -------------------------------------------------------------- 状态栏 */

  private setupStatusBar(): void {
    if (this.statusBar === null) {
      this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
      this.statusBar.command = 'musicPlayer.playPause';
      this.disposables.push(this.statusBar);
    }
    this.applyStatusBarVisibility();
  }

  /** 按设置显示/隐藏状态栏项。 */
  private applyStatusBarVisibility(): void {
    const bar = this.statusBar;
    if (bar === null) return;
    if (this.config().get<boolean>('showStatusBar', true)) {
      this.updateStatusBar();
      bar.show();
    } else {
      bar.hide();
    }
  }

  private updateStatusBar(): void {
    const bar = this.statusBar;
    if (bar === null) return;
    const state = this.player.current;
    if (state.track === null) {
      bar.text = '$(music) 音乐播放器';
      bar.tooltip = '打开侧边栏播放器';
    } else {
      const icon = state.playing ? '$(debug-pause)' : '$(debug-start)';
      const mute = state.muted ? '$(mute) ' : '';
      const position = formatTime(state.position);
      const duration = formatTime(state.duration);
      bar.text = `${icon} ${mute}${truncate(state.track.title, 32)} ${position}/${duration}`;
      bar.tooltip = state.muted
        ? `${state.track.title}\n${state.track.author}\n（被浏览器策略静音：点一下播放器即可恢复声音）`
        : `${state.track.title}\n${state.track.author}`;
    }
    bar.show();
  }

  /* ---------------------------------------------------------------- 命令 */

  private registerCommands(): void {
    const register = (id: string, handler: (...args: unknown[]) => unknown): void => {
      this.disposables.push(vscode.commands.registerCommand(id, handler));
    };

    register('musicPlayer.focus', async () => {
      await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
      this.post({ type: 'command', command: 'focusSearch' });
    });

    register('musicPlayer.playPause', () => {
      if (!this.post({ type: 'command', command: 'playPause' })) {
        void vscode.commands.executeCommand(`${VIEW_ID}.focus`);
      }
    });

    register('musicPlayer.next', () => {
      void this.advanceBy(1, false);
    });
    register('musicPlayer.previous', () => {
      void this.advanceBy(-1, false);
    });

    register('musicPlayer.searchSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      const selection = editor?.document.getText(editor.selection).trim() ?? '';
      const keyword = selection !== '' ? selection : await vscode.env.clipboard.readText();
      await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
      await this.runSearch(keyword, 1);
    });

    register('musicPlayer.clearCache', async () => {
      await this.clearAudioCache();
    });

    register('musicPlayer.showLog', () => this.output.show(true));

    register('musicPlayer.selfTest', async () => {
      await this.runSelfTest();
    });

    register('musicPlayer.login', () => {
      void this.startLogin();
    });
    register('musicPlayer.logout', () => {
      void this.logout();
    });
    register('musicPlayer.openFavorites', async () => {
      await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
      this.showTab('favorites');
      await this.loadFavoriteFolders();
    });

    void vscode.commands.executeCommand('setContext', 'musicPlayer.loggedIn', this.session.isLoggedIn);
  }

  /* --------------------------------------------------------------- 自检 */

  private async handleUri(uri: vscode.Uri): Promise<void> {
    this.logger.info(`收到 URI：${uri.toString()}`);
    if (uri.path === '/selftest') await this.runSelfTest();
  }

  private async runSelfTest(): Promise<void> {
    if (this.selftestRunning) {
      this.toast('warn', '自检正在运行中');
      return;
    }
    this.selftestRunning = true;
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    try {
      const result = await runSidebarPlaybackSelfTest({
        runCommand: async (command) => {
          await vscode.commands.executeCommand(command);
        },
        sampler: this.sampler,
        logger: this.logger,
        waitForViewReady: async (timeoutMs) => {
          const deadline = Date.now() + timeoutMs;
          while (Date.now() < deadline) {
            if (this.view?.isReady === true) return true;
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
          return this.view?.isReady === true;
        },
        startPlayback: async () => {
          try {
            await this.playTrack(SELFTEST_TRACK);
            return;
          } catch (error) {
            this.logger.warn('自检曲目不可用，退回搜索一首', error);
          }
          const fallback = await this.api.searchVideos({ keyword: '钢琴', page: 1 });
          const first = fallback.items[0];
          if (!first?.bvid) throw new Error('自检：既播不了固定曲目，搜索也没有结果');
          await this.playTrack({
            bvid: first.bvid,
            title: stripHtmlTags(first.title),
            author: first.author ?? '',
            cover: first.pic ?? '',
            durationSeconds: parseDurationText(first.duration) ?? 0,
            pageCount: 0,
          });
        },
        writeReport: async (text) => {
          const file = await writeSelfTestReport(this.context.globalStorageUri, text);
          this.logger.info(`自检报告已写入：${file}`);
        },
      });
      this.output.appendLine(result.report);
      // 顺手把设置页打开一次：界面会把读到的缓存占用回报到日志里，便于无人值守核对。
      this.showTab('settings');
      await new Promise((resolve) => setTimeout(resolve, 1500));
      this.logger.info('自检结束：已切到设置页以核对缓存读数');
      this.output.show(true);
      void vscode.window.showInformationMessage(
        result.pass ? '自检通过：隐藏侧边栏后音乐继续播放' : '自检未通过：详见「音乐播放器」输出面板',
      );
    } catch (error) {
      this.logger.error('自检执行失败', error);
      this.output.show(true);
    } finally {
      this.selftestRunning = false;
    }
  }
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** 人类可读的字节数（消息提示里用）。 */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

let app: MusicPlayerApp | null = null;

export function activate(context: vscode.ExtensionContext): void {
  app = new MusicPlayerApp(context);
  void app.start().catch((error: unknown) => {
    void vscode.window.showErrorMessage(
      `音乐播放器启动失败：${error instanceof Error ? error.message : String(error)}`,
    );
  });
}

export function deactivate(): void {
  app?.dispose();
  app = null;
}
