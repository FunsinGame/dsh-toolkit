/**
 * webview ⇄ 扩展宿主 的消息契约。
 *
 * webview 侧是 `media/sidebar.js`（原生 JS，不参与编译），所以这里的类型是
 * 「权威定义」——改字段时记得同步改 `sidebar.js`。
 */

/** 队列/列表里的一条音轨。 */
export interface TrackSummary {
  bvid: string;
  /** 分 P 的 cid；只有点播时才解析（搜索接口不给）。 */
  cid?: number;
  title: string;
  author: string;
  cover: string;
  /** 秒；未知为 0。 */
  durationSeconds: number;
  /** 分 P 数量，> 1 时 UI 显示角标。 */
  pageCount: number;
  /** 收藏夹来源时为该收藏夹里的条目 id。 */
  favoriteId?: number;
  /** 已失效（收藏夹里 `attr !== 0`）。 */
  invalid?: boolean;
}

export interface SearchView {
  keyword: string;
  page: number;
  numPages: number;
  items: TrackSummary[];
}

/** 客户端音频能力探测结果，用于决定「直通」还是「宿主转码」。 */
export interface ClientCapabilities {
  aac: boolean;
  wav: boolean;
  mp4: boolean;
  ogg: boolean;
  /** `canPlayType` 的原始返回值，便于排查。 */
  raw?: Record<string, string>;
}

export type PrepareStage = 'queued' | 'fetch' | 'demux' | 'decode' | 'cache' | 'ready';

/** 设置面板读到的设置快照（字段与 `settings.ts` 的 SettingsState 保持一致）。 */
export interface SettingsState {
  audioQuality: number;
  defaultPlayMode: PlayMode;
  volume: number;
  /** 播放速度倍率（1 = 原速）。 */
  playbackRate: number;
  cacheEnabled: boolean;
  cacheMaxMB: number;
  requestIntervalMs: number;
  logLevel: 'off' | 'info' | 'debug';
  showStatusBar: boolean;
}

/** 侧边栏的页签。 */
export type SidebarTab = 'search' | 'favorites' | 'queue' | 'account' | 'settings';

/** 播放模式。 */
export type PlayMode = 'sequential' | 'repeat-all' | 'repeat-one' | 'shuffle';

/** 账号信息（头像已转成代理地址）。 */
export interface AccountUser {
  mid: number;
  name: string;
  face: string;
}

/** 收藏夹列表里的一项。 */
export interface FavoriteFolderView {
  id: number;
  title: string;
  /** 收藏夹内条目数（B 站自报，含非视频项）。 */
  count: number;
}

/** 「加入收藏夹」界面里的一项：是否已在其中。 */
export interface FavoriteMembershipView {
  id: number;
  title: string;
  selected: boolean;
}

/** 扫码登录状态（与 `auth/qrLogin.ts` 的 QrLoginStatus 对应）。 */
export type AuthStatus = 'waiting' | 'scanned' | 'success' | 'expired' | 'cancelled' | 'error';


/** webview 首帧需要的全部信息（同步注入到 `window.__MUSIC_PLAYER_BOOT__`）。 */
export interface BootstrapPayload {
  proxyPort: number;
  proxyToken: string;
  quality: number;
  cacheEnabled: boolean;
  loggedIn: boolean;
  version: string;
}

export type HostToWebview =
  | ({ type: 'bootstrap' } & BootstrapPayload)
  | { type: 'searchResult'; view: SearchView }
  /** 宿主开始准备某个音源：界面应立刻停掉当前声音并显示等待状态。 */
  | { type: 'player.loading'; track: TrackSummary }
  | { type: 'playerSource'; track: TrackSummary; url: string; resumeAt: number }
  | {
      type: 'playerState';
      track: TrackSummary | null;
      playing: boolean;
      position: number;
      duration: number;
      /**
       * 被自动播放策略逼成静音时为 true，状态栏会显示 🔇。
       *
       * 注意这里**不带**音量与倍速：它们是用户设置，只走 `settings.state`。
       * 曾经把音量也塞进 playerState，结果一个较早发出的状态消息晚到，就把用户
       * 刚拖好的音量覆盖回了旧值。
       */
      muted: boolean;
    }
  | { type: 'prepare'; stage: PrepareStage; message: string; percent: number | null }
  | { type: 'toast'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'selftest'; running: boolean; message: string }
  | { type: 'auth.state'; loggedIn: boolean; user: AccountUser | null }
  /** 二维码（data URL 形式的 SVG，直接塞进 `<img src>`）。 */
  | { type: 'auth.qr'; dataUrl: string }
  | { type: 'auth.status'; status: AuthStatus; message: string }
  /** 命令面板/快捷键触发的动作，交给 webview 里的 `<audio>` 执行。 */
  | {
      type: 'command';
      command: 'playPause' | 'next' | 'previous' | 'focusSearch' | 'showTab';
      keyword?: string;
      tab?: SidebarTab;
    }
  /* -------------------------------------------------------------- 收藏夹 */
  | { type: 'favorites.folders'; items: FavoriteFolderView[] }
  | {
      type: 'favorites.contents';
      mediaId: number;
      page: number;
      title: string;
      total: number;
      hasMore: boolean;
      items: TrackSummary[];
    }
  | { type: 'favorites.membership'; bvid: string; folders: FavoriteMembershipView[] }
  /** 原生确认对话框的结果（删除收藏夹之类的破坏性操作走它）。 */
  | { type: 'dialog.result'; id: string; confirmed: boolean }
  /** 某个耗时操作的开始/结束，用于禁用按钮。 */
  | { type: 'busy'; what: string; on: boolean }
  /* ---------------------------------------------------------------- 队列 */
  /** 队列变化。`index` 是「正在播的那首」在 `items` 里的下标（没有则 -1）。 */
  | { type: 'queue.state'; items: TrackSummary[]; index: number; mode: PlayMode }
  /* ------------------------------------------------------ 设置与缓存 */
  | { type: 'cache.info'; info: CacheInfo }
  | { type: 'settings.state'; settings: SettingsState };

/** 音频缓存的磁盘占用。 */
export interface CacheInfo {
  files: number;
  bytes: number;
  /** 上限（字节），来自 `musicPlayer.cache.maxMB`。 */
  maxBytes: number;
  /** 缓存目录（展示用；为空表示缓存已关闭）。 */
  dir: string;
  enabled: boolean;
}

export type WebviewToHost =
  | { type: 'ready'; capabilities: ClientCapabilities }
  | { type: 'search'; keyword: string; page: number }
  | { type: 'play'; track: TrackSummary }
  /**
   * 播放某一首，并可把整个列表接管为播放队列。
   * 列表里点歌就是这个语义：从这一首开始按列表顺序往下播。
   */
  | { type: 'play'; track: TrackSummary; queue?: TrackSummary[]; index?: number }
  /**
   * 预取：鼠标悬停时就先把音频物化好，真正点击时才能立刻起播。
   * 这不是洁癖式优化——`play()` 必须落在点击后的 5 秒手势窗口内，
   * 否则会被自动播放策略拒绝（表现为「时钟在走但没有声音」）。
   */
  | { type: 'prepareTrack'; track: TrackSummary }
  | { type: 'toggle' }
  | { type: 'seek'; position: number }
  | { type: 'stop' }
  /* ---------------------------------------------------------------- 队列 */
  | { type: 'player.next' }
  | { type: 'player.previous' }
  /** 当前这首自然放完了（由 `<audio>` 的 ended 事件触发）。 */
  | { type: 'player.ended' }
  | { type: 'player.setMode'; mode: PlayMode }
  | { type: 'queue.enqueue'; track: TrackSummary }
  | { type: 'queue.remove'; index: number }
  | { type: 'queue.move'; from: number; to: number }
  | { type: 'queue.playAt'; index: number }
  | { type: 'queue.clear' }
  /* ------------------------------------------------------ 设置与缓存 */
  /** 请求缓存占用与设置快照。 */
  | { type: 'cache.stats' }
  | { type: 'cache.clear' }
  | { type: 'settings.get' }
  | { type: 'settings.set'; key: string; value: string | number | boolean }
  /** 扫码登录：开始 / 取消 / 退出。 */
  | { type: 'auth.start' }
  | { type: 'auth.cancel' }
  | { type: 'auth.logout' }
  /* -------------------------------------------------------------- 收藏夹 */
  | { type: 'favorites.list' }
  | { type: 'favorites.open'; mediaId: number; page: number; keyword?: string }
  | { type: 'favorites.create'; title: string; privacy: 0 | 1 }
  | { type: 'favorites.removeFolder'; mediaId: number; title: string }
  | { type: 'favorites.removeResources'; mediaId: number; bvids: string[] }
  | { type: 'favorites.membership'; bvid: string }
  | { type: 'favorites.deal'; bvid: string; addIds: string[]; delIds: string[] }
  /** 请宿主弹一个原生确认框；结果通过 `dialog.result` 回来。 */
  | { type: 'dialog.confirm'; id: string; message: string; detail?: string }
  | {
      type: 'report';
      playing: boolean;
      position: number;
      duration: number;
      error?: string;
      volume?: number;
      /** 处于「被自动播放策略逼成静音」状态。 */
      muted?: boolean;
    }
  | { type: 'log'; message: string; level?: 'info' | 'warn' | 'error' };

/**
 * 所有合法的 webview → 宿主消息类型。
 *
 * 这份数组是运行期白名单的唯一来源。之所以不手写 Set：之前就是漏加了
 * `prepareTrack` 与 `auth.start`，宿主把它们当未知消息直接丢掉，界面永远卡在
 * 「正在获取二维码…」。下面两个编译期断言保证数组与上面的联合类型不会脱节。
 */
export const WEBVIEW_TO_HOST_TYPES = [
  'ready',
  'search',
  'play',
  'prepareTrack',
  'toggle',
  'seek',
  'stop',
  'player.next',
  'player.previous',
  'player.ended',
  'player.setMode',
  'queue.enqueue',
  'queue.remove',
  'queue.move',
  'queue.playAt',
  'queue.clear',
  'cache.stats',
  'cache.clear',
  'settings.get',
  'settings.set',
  'auth.start',
  'auth.cancel',
  'auth.logout',
  'favorites.list',
  'favorites.open',
  'favorites.create',
  'favorites.removeFolder',
  'favorites.removeResources',
  'favorites.membership',
  'favorites.deal',
  'dialog.confirm',
  'report',
  'log',
] as const;

export type WebviewToHostType = (typeof WEBVIEW_TO_HOST_TYPES)[number];

type MissingFromWhitelist = Exclude<WebviewToHost['type'], WebviewToHostType>;
type ExtraInWhitelist = Exclude<WebviewToHostType, WebviewToHost['type']>;
/* eslint-disable @typescript-eslint/no-unused-vars */
// 若有类型忘了加进 WEBVIEW_TO_HOST_TYPES（或被删除后留下残留），下面两行会编译失败。
const whitelistCoversUnion: MissingFromWhitelist extends never ? true : never = true;
const whitelistHasNoExtras: ExtraInWhitelist extends never ? true : never = true;
void whitelistCoversUnion;
void whitelistHasNoExtras;

/** 运行期判断某个字符串是否是合法的入站消息类型。 */
export function isWebviewToHostType(value: string): value is WebviewToHostType {
  return (WEBVIEW_TO_HOST_TYPES as readonly string[]).includes(value);
}

/** 音质档位（与 package.json 的枚举保持一致）。 */
export const DEFAULT_QUALITY = 30280;
