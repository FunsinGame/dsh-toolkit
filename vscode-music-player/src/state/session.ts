/**
 * 凭据存储。
 *
 * 用 `SecretStorage`（Windows 上是 DPAPI 加密）而不是 `globalState`——cookie 等价于
 * 账号密码，不该明文躺在磁盘上。
 *
 * 这里只依赖一个最小接口而不是 `vscode.SecretStorage`，因此可以脱离 VS Code
 * 单独测试；扩展里传入 `context.secrets`。
 */

import type { CookieJar } from '../bilibili/cookies';
import {
  isLoggedIn as hasLoginCookies,
  mergeCookies,
  parseCookieHeader,
  serializeCookie,
} from '../bilibili/cookies';
import { silentLogger, type Logger } from '../util/log';

export interface SecretStorageLike {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}

export interface StoredCredentials {
  cookies: CookieJar;
  buvid3?: string;
  buvid4?: string;
  savedAt: number;
}

const DEFAULT_KEY = 'musicPlayer.credentials';

export class SessionStore {
  private cached: StoredCredentials | null = null;
  private readonly logger: Logger;

  constructor(
    private readonly secrets: SecretStorageLike,
    private readonly key: string = DEFAULT_KEY,
    logger?: Logger,
  ) {
    this.logger = logger ?? silentLogger;
  }

  /** 从密钥存储读取（扩展激活时调一次）。 */
  async load(): Promise<StoredCredentials | null> {
    try {
      const raw = await this.secrets.get(this.key);
      if (raw === undefined || raw === '') {
        this.cached = null;
        return null;
      }
      const parsed = JSON.parse(raw) as StoredCredentials;
      if (!parsed || typeof parsed !== 'object' || typeof parsed.cookies !== 'object') {
        throw new Error('凭据格式不正确');
      }
      this.cached = parsed;
      return parsed;
    } catch (error) {
      this.logger.error('读取登录凭据失败，将视为未登录', error);
      this.cached = null;
      return null;
    }
  }

  /** 同步取 cookie（HTTP 客户端需要同步读）。 */
  get cookies(): CookieJar | null {
    return this.cached?.cookies ?? null;
  }

  get credentials(): StoredCredentials | null {
    return this.cached;
  }

  /**
   * 是否已登录。
   *
   * 注意**不能**用「cookie jar 非空」判断：启动时写进去的设备指纹
   * （buvid3/buvid4）也会让 jar 非空，那样每次启动都会误判为已登录、
   * 白跑一次 `/x/space/myinfo`，拿到 -101 再把凭据清掉。真正的登录凭据是
   * `SESSDATA`（会话）与 `bili_jct`（写操作 csrf）。
   */
  get isLoggedIn(): boolean {
    return hasLoginCookies(this.cached?.cookies);
  }

  /** 设备指纹是否已就绪。 */
  get hasDeviceId(): boolean {
    return (this.cached?.buvid3 ?? '') !== '';
  }

  /** 覆盖写入 cookie（扫码登录成功后调用）。 */
  async setCookies(cookies: CookieJar): Promise<void> {
    const previous = this.cached;
    await this.persist({
      cookies,
      savedAt: Date.now(),
      ...(previous?.buvid3 === undefined ? {} : { buvid3: previous.buvid3 }),
      ...(previous?.buvid4 === undefined ? {} : { buvid4: previous.buvid4 }),
    });
  }

  /** 合并新 cookie（刷新 SESSDATA、补 buvid 等）。 */
  async mergeCookies(extra: CookieJar): Promise<void> {
    const previous = this.cached;
    await this.persist({
      cookies: mergeCookies(previous?.cookies, extra),
      savedAt: Date.now(),
      ...(previous?.buvid3 === undefined ? {} : { buvid3: previous.buvid3 }),
      ...(previous?.buvid4 === undefined ? {} : { buvid4: previous.buvid4 }),
    });
  }

  /** 直接设置一段 Cookie 头（手动粘贴时用，P0b 尚未暴露入口）。 */
  async setCookieHeader(header: string): Promise<void> {
    await this.setCookies(parseCookieHeader(header));
  }

  /** 记录设备指纹，降低风控概率。 */
  async setBuvid(buvid3: string, buvid4: string): Promise<void> {
    const previous = this.cached;
    await this.persist({
      cookies: mergeCookies(previous?.cookies, { buvid3, buvid4 }),
      savedAt: previous?.savedAt ?? Date.now(),
      buvid3,
      buvid4,
    });
  }

  async clear(): Promise<void> {
    this.cached = null;
    await this.secrets.delete(this.key);
  }

  /**
   * 只清登录凭据，保留设备指纹。
   *
   * 退出登录、或凭据被服务端判为失效时用这个：buvid 不是账号信息，丢掉它反而会让
   * 下次启动多一次取指纹的请求，也更容易触发风控。
   */
  static readonly LOGIN_COOKIE_NAMES: readonly string[] = [
    'SESSDATA',
    'bili_jct',
    'DedeUserID',
    'DedeUserID__ckMd5',
    'sid',
  ];

  async clearLogin(): Promise<void> {
    const previous = this.cached;
    if (previous === null) return;
    const remaining: CookieJar = {};
    for (const [name, value] of Object.entries(previous.cookies)) {
      if (!SessionStore.LOGIN_COOKIE_NAMES.includes(name)) remaining[name] = value;
    }
    await this.persist({
      cookies: remaining,
      savedAt: Date.now(),
      ...(previous.buvid3 === undefined ? {} : { buvid3: previous.buvid3 }),
      ...(previous.buvid4 === undefined ? {} : { buvid4: previous.buvid4 }),
    });
  }

  /** 当前 cookie 的 `Cookie` 头（诊断用）。 */
  cookieHeader(): string {
    return serializeCookie(this.cookies);
  }

  private async persist(next: StoredCredentials): Promise<void> {
    this.cached = next;
    await this.secrets.store(this.key, JSON.stringify(next));
  }
}
