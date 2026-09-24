/**
 * B 站接口集合。
 *
 * 只封装本插件需要的端点，每个方法都对应参考实现里验证过的调用方式（路径、
 * 参数、WBI 签名与否）。写操作（收藏夹增删）在 P5 加入。
 */

import { BilibiliError } from './errors';
import { bv2av } from './ids';
import type { BilibiliClient } from './client';
import type { WbiKeyStore } from './wbi';
import type {
  AudioStream,
  BuvidData,
  DealFavoriteResponse,
  FavoriteContentsPage,
  FavoriteFolder,
  FavoriteResourceId,
  NavData,
  PageListItem,
  PlayUrlData,
  SearchResultData,
  SearchVideoItem,
  UserInfoData,
} from './types';
import { silentLogger, type Logger } from '../util/log';

export interface SearchVideosOptions {
  keyword: string;
  page?: number;
  signal?: AbortSignal;
}

export interface SearchVideosResult {
  items: SearchVideoItem[];
  numPages: number;
}

export interface AudioStreamOptions {
  bvid: string;
  cid: number;
  /** 期望音质，默认 192K。 */
  quality?: number;
  signal?: AbortSignal;
}

/** 音质从高到低排序，用于「要不到就退而求其次」。 */
function sortAudioTracks(tracks: NonNullable<NonNullable<PlayUrlData['dash']>['audio']>) {
  return [...tracks].sort((left, right) => right.id - left.id);
}

/** 从 playurl 响应里挑一条可用的音频流。 */
export function pickAudioStream(data: PlayUrlData, quality: number): AudioStream {
  const dashDuration = data.dash?.duration;
  const durationFromTimelength =
    typeof data.timelength === 'number' && data.timelength > 0 ? data.timelength / 1000 : null;
  // `dash.duration` 是秒；分片文件经常是 0，此时以 timelength（毫秒）兜底。
  const dashSeconds =
    typeof dashDuration === 'number' && dashDuration > 0 ? dashDuration : durationFromTimelength;

  const tracks = data.dash?.audio;
  if (Array.isArray(tracks) && tracks.length > 0) {
    const sorted = sortAudioTracks(tracks);
    const picked = sorted.find((track) => track.id === quality) ?? sorted[0];
    if (picked && typeof picked.baseUrl === 'string' && picked.baseUrl !== '') {
      return {
        url: picked.baseUrl,
        backupUrls: picked.backupUrl ?? [],
        quality: picked.id,
        codecs: picked.codecs ?? null,
        mimeType: picked.mimeType ?? null,
        container: 'dash',
        durationSeconds: dashSeconds,
      };
    }
  }

  const durl = data.durl;
  if (Array.isArray(durl) && durl.length > 0 && typeof durl[0]?.url === 'string') {
    return {
      url: durl[0].url,
      backupUrls: durl[0].backup_url ?? [],
      quality: data.quality ?? 0,
      codecs: null,
      mimeType: null,
      container: 'durl',
      durationSeconds: durationFromTimelength,
    };
  }

  throw new BilibiliError('unavailable', '该视频没有返回可用的音频流，可能是付费/会员专享或已下架');
}

export interface BilibiliApiOptions {
  /** 注入 sleep 便于单测（软风控重试要等一下）。 */
  sleep?: (ms: number) => Promise<void>;
  /** 检测到软风控后的重试等待，默认 2500ms。 */
  softBlockRetryDelayMs?: number;
}

/**
 * 判断搜索响应是不是「软风控」。
 *
 * 正常无结果与风控拦截的区别：风控返回 `result: []` 且 **不带** `numPages` /
 * `numResults` 字段；正常的空搜索会老老实实给 `numPages: 0`。识别出来才能给出
 * 「稍后再试/登录后重试」这类正确指引，而不是骗用户说「没搜到」。
 */
export function looksSoftBlocked(data: SearchResultData): boolean {
  const empty = data.result === null || data.result.length === 0;
  return empty && data.numPages === undefined && data.numResults === undefined;
}

export class BilibiliApi {
  private readonly logger: Logger;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly softBlockRetryDelayMs: number;

  constructor(
    private readonly client: BilibiliClient,
    private readonly wbi: WbiKeyStore,
    logger?: Logger,
    options: BilibiliApiOptions = {},
  ) {
    this.logger = logger ?? silentLogger;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.softBlockRetryDelayMs = options.softBlockRetryDelayMs ?? 2500;
  }

  /** 取 wbi keys（未登录也会返回），顺带可用作登录态探测。 */
  async getNav(signal?: AbortSignal): Promise<NavData> {
    return this.client.get<NavData>({
      endpoint: '/x/web-interface/nav',
      // 未登录时 code = -101，但 data 里仍有 wbi_img。
      allowCodes: [-101],
      ...(signal === undefined ? {} : { signal }),
    });
  }

  /** 取设备指纹（buvid3/buvid4），用于降低风控概率。 */
  async fetchBuvid(signal?: AbortSignal): Promise<BuvidData | null> {
    const data = await this.client.get<BuvidData | null>({
      endpoint: '/x/frontend/finger/spi',
      ...(signal === undefined ? {} : { signal }),
    });
    if (!data || typeof data.b_3 !== 'string' || typeof data.b_4 !== 'string') return null;
    return data;
  }

  /** 关键词搜索视频（带一次软风控重试）。 */
  async searchVideos(options: SearchVideosOptions): Promise<SearchVideosResult> {
    const page = options.page ?? 1;
    const query = await this.wbi.signQuery({
      keyword: options.keyword,
      search_type: 'video',
      page: String(page),
    });

    const request = async (): Promise<SearchResultData> =>
      this.client.get<SearchResultData>({
        endpoint: '/x/web-interface/wbi/search/type',
        params: query,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });

    let data = await request();
    if (looksSoftBlocked(data)) {
      this.logger.warn(`搜索疑似被风控拦截，${this.softBlockRetryDelayMs}ms 后重试一次`);
      await this.sleep(this.softBlockRetryDelayMs);
      data = await request();
      if (looksSoftBlocked(data)) {
        throw new BilibiliError(
          'risk',
          '搜索被 B 站风控拦截（返回空结果），请稍后再试，或扫码登录后再搜',
        );
      }
    }

    const items = (data.result ?? []).filter(
      (item): item is SearchVideoItem & { bvid: string } =>
        typeof item.bvid === 'string' && item.bvid !== '',
    );
    this.logger.debug(`搜索「${options.keyword}」第 ${page} 页`, {
      count: items.length,
      numPages: data.numPages,
    });
    return { items, numPages: data.numPages ?? 1 };
  }

  /** 取视频分 P（同时给出每 P 的 cid 与时长，cid 是 playurl 的必需参数）。 */
  async getPageList(bvid: string, signal?: AbortSignal): Promise<PageListItem[]> {
    const pages = await this.client.get<PageListItem[]>({
      endpoint: '/x/player/pagelist',
      params: { bvid },
      ...(signal === undefined ? {} : { signal }),
    });
    if (!Array.isArray(pages) || pages.length === 0) {
      throw new BilibiliError('unavailable', `该视频没有可播放的分 P：${bvid}`);
    }
    return pages;
  }

  /** 取音频流地址（带 deadline 签名，会过期）。 */
  async getAudioStream(options: AudioStreamOptions): Promise<AudioStream> {
    const quality = options.quality ?? 30280;
    const query = await this.wbi.signQuery({
      bvid: options.bvid,
      cid: String(options.cid),
      fnval: '4048',
      fnver: '0',
      fourk: '1',
      qlt: String(quality),
      voice_balance: '1',
    });
    const data = await this.client.get<PlayUrlData>({
      endpoint: '/x/player/wbi/playurl',
      params: query,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    const stream = pickAudioStream(data, quality);
    this.logger.debug('取到音频流', {
      bvid: options.bvid,
      cid: options.cid,
      container: stream.container,
      quality: stream.quality,
      codecs: stream.codecs,
    });
    return stream;
  }

  /** 当前登录用户信息。 */
  async getUserInfo(signal?: AbortSignal): Promise<UserInfoData> {
    return this.client.get<UserInfoData>({
      endpoint: '/x/space/myinfo',
      ...(signal === undefined ? {} : { signal }),
    });
  }

  /* ---------------------------------------------------------------- 收藏夹 */

  /**
   * 某个用户的收藏夹列表（含自己创建的）。
   *
   * 传 `bvid` 时会顺带返回每个收藏夹的 `fav_state`（该视频是否在其中），
   * 用于「加入收藏夹」界面的勾选状态。
   */
  async getFavoriteFolders(options: {
    mid: number;
    bvid?: string;
    signal?: AbortSignal;
  }): Promise<FavoriteFolder[]> {
    const params: Record<string, string | number | undefined> = { up_mid: options.mid };
    if (options.bvid !== undefined && options.bvid !== '') {
      params.rid = bv2av(options.bvid);
      params.type = '2';
    }
    const data = await this.client.get<{ count?: number; list: FavoriteFolder[] | null } | null>({
      endpoint: '/x/v3/fav/folder/created/list-all',
      params,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    return data?.list ?? [];
  }

  /** 收藏夹内容（分页，每页 40 条——与网页端一致）。 */
  async getFavoriteContents(options: {
    mediaId: number;
    page?: number;
    keyword?: string;
    /** `this` 只搜本收藏夹，`all` 在全部收藏夹里搜（B 站要求同时给一个有效 media_id）。 */
    scope?: 'this' | 'all';
    signal?: AbortSignal;
  }): Promise<FavoriteContentsPage> {
    const params: Record<string, string> = {
      media_id: String(options.mediaId),
      pn: String(options.page ?? 1),
      ps: '40',
    };
    if (options.keyword !== undefined && options.keyword !== '') {
      params.keyword = options.keyword;
      params.type = options.scope === 'all' ? '1' : '0';
    }
    const data = await this.client.get<FavoriteContentsPage>({
      endpoint: '/x/v3/fav/resource/list',
      params,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    this.logger.debug('取到收藏夹内容', {
      mediaId: options.mediaId,
      page: options.page ?? 1,
      count: data.medias?.length ?? 0,
      hasMore: data.has_more,
    });
    return { ...data, medias: data.medias ?? [] };
  }

  /** 收藏夹内所有条目的 id/bvid（批量操作前取目标用）。 */
  async getFavoriteResourceIds(mediaId: number, signal?: AbortSignal): Promise<FavoriteResourceId[]> {
    const data = await this.client.get<FavoriteResourceId[]>({
      endpoint: '/x/v3/fav/resource/ids',
      params: { media_id: String(mediaId) },
      ...(signal === undefined ? {} : { signal }),
    });
    // 空收藏夹时接口可能给 null，甚至给 `{}`——一律收敛成数组。
    return Array.isArray(data) ? data : [];
  }

  /** 新建收藏夹。 */
  async createFavoriteFolder(options: {
    title: string;
    intro?: string;
    privacy?: 0 | 1;
  }): Promise<{ id: number; fid: number; mid: number; title: string }> {
    return this.client.postWithCsrf({
      endpoint: '/x/v3/fav/folder/add',
      payload: {
        title: options.title,
        intro: options.intro ?? '',
        privacy: String(options.privacy ?? 0),
      },
    });
  }

  /**
   * 删除收藏夹（可批量）。
   *
   * 接口是 `/x/v3/fav/folder/del`，参数 `media_ids` 为逗号分隔的收藏夹 id。
   * 无凭据时该路由返回 -101（未登录），已实测确认路由存在。
   */
  async deleteFavoriteFolders(mediaIds: number[]): Promise<void> {
    if (mediaIds.length === 0) return;
    await this.client.postWithCsrf({
      endpoint: '/x/v3/fav/folder/del',
      payload: { media_ids: mediaIds.join(',') },
    });
  }

  /**
   * 把视频加入/移出若干收藏夹（一次请求完成）。
   *
   * `addToFavoriteIds` / `delInFavoriteIds` 都是收藏夹 id 的字符串数组。
   */
  async dealFavoriteForOneVideo(options: {
    bvid: string;
    addToFavoriteIds: string[];
    delInFavoriteIds: string[];
  }): Promise<DealFavoriteResponse> {
    return this.client.postWithCsrf({
      endpoint: '/x/v3/fav/resource/deal',
      payload: {
        rid: String(bv2av(options.bvid)),
        type: '2',
        add_media_ids: options.addToFavoriteIds.join(','),
        del_media_ids: options.delInFavoriteIds.join(','),
      },
    });
  }

  /** 从收藏夹批量移除视频。 */
  async removeFavoriteResources(options: { mediaId: number; bvids: string[] }): Promise<void> {
    if (options.bvids.length === 0) return;
    // `resources` 的格式是 `avid:类型` 用逗号连接；类型 2 = 视频稿件。
    const resources = options.bvids.map((bvid) => `${bv2av(bvid)}:2`).join(',');
    await this.client.postWithCsrf({
      endpoint: '/x/v3/fav/resource/batch-del',
      payload: {
        resources,
        media_id: String(options.mediaId),
        platform: 'web',
      },
    });
  }
}
