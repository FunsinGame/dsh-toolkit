/**
 * B 站接口的响应类型（只保留本插件用到的字段）。
 *
 * 参考实现的类型里没有列 `codecs`/`mimeType`/`bandwidth`，但真实响应里有，
 * 选流和诊断都要用到，因此这里补上（字段全部可选，接口变更时不会硬崩）。
 */

export interface NavData {
  isLogin?: boolean;
  mid?: number;
  uname?: string;
  face?: string;
  wbi_img: {
    img_url: string;
    sub_url: string;
  };
}

export interface BuvidData {
  b_3: string;
  b_4: string;
}

export interface SearchVideoItem {
  bvid?: string;
  aid?: number;
  title?: string;
  pic?: string;
  author?: string;
  mid?: number;
  /** `MM:SS`，分钟数可能超过 60。 */
  duration?: string;
  senddate?: number;
  typeid?: number;
  typename?: string;
  play?: number;
  /** 搜索接口会给「视频合集」等非投稿项，靠 type 区分。 */
  type?: string;
}

export interface SearchResultData {
  result: SearchVideoItem[] | null;
  numPages?: number;
  numResults?: number;
  page?: number;
}

export interface PageListItem {
  cid: number;
  page: number;
  part: string;
  duration: number;
  first_frame?: string;
}

export interface DashAudioTrack {
  id: number;
  baseUrl: string;
  backupUrl?: string[];
  bandwidth?: number;
  codecs?: string;
  mimeType?: string;
}

export interface PlayUrlData {
  dash?: {
    duration?: number;
    audio?: DashAudioTrack[] | null;
  } | null;
  durl?:
    | Array<{
        order: number;
        url: string;
        backup_url?: string[];
        length?: number;
        size?: number;
      }>
    | null;
  /** 时长（毫秒）。 */
  timelength?: number;
  accept_quality?: number[];
  quality?: number;
}

export interface UserInfoData {
  mid: number;
  name: string;
  face: string;
  sign?: string;
}

/* ------------------------------------------------------------------ 收藏夹 */

/** `/x/v3/fav/folder/created/list-all` 里的单个收藏夹。 */
export interface FavoriteFolder {
  id: number;
  /** dav 权限位，不用管。 */
  fid?: number;
  mid?: number;
  title: string;
  media_count: number;
  /** 目标视频是否在该收藏夹里：0 否，1 是（未传 rid 时恒为 0）。 */
  fav_state?: number;
  attr?: number;
  fav_state_count?: number;
}

/** 收藏夹内容项。`id` 是 avid，不是收藏夹 id。 */
export interface FavoriteContentItem {
  id: number;
  bvid: string;
  title: string;
  cover: string;
  /** 秒。 */
  duration: number;
  pubdate: number;
  /** 分 P 数量。 */
  page: number;
  /** 2：视频稿件；12：音频；21：视频合集。 */
  type: number;
  /** 0：正常；9：up 自己删除；1：其他原因删除。 */
  attr: number;
  upper: {
    mid: number;
    name: string;
    face: string;
  };
  intro?: string;
}

/** `/x/v3/fav/resource/list` 的 data。 */
export interface FavoriteContentsPage {
  info: {
    id: number;
    title: string;
    cover: string;
    media_count: number;
    intro: string;
    upper: { mid: number; name: string; face: string };
  } | null;
  medias: FavoriteContentItem[] | null;
  has_more: boolean;
  ttl?: number;
}

/** `/x/v3/fav/resource/ids` 的单项（只有 id 与 bvid）。 */
export interface FavoriteResourceId {
  id: number;
  bvid: string;
  type: number;
}

/** `/x/v3/fav/resource/deal` 的返回。 */
export interface DealFavoriteResponse {
  prompt?: boolean;
  toast_msg?: string;
  success_num?: number;
}

/** 音质档位：B 站 dash 音频的 `id`。 */
export const AUDIO_QUALITY = {
  /** 64K */
  LOW: 30216,
  /** 132K */
  MEDIUM: 30232,
  /** 192K */
  HIGH: 30280,
} as const;

export type AudioQualityId = (typeof AUDIO_QUALITY)[keyof typeof AUDIO_QUALITY];

export interface AudioStream {
  /** 播放地址（带 deadline 签名，会过期）。 */
  url: string;
  /** 备用地址。 */
  backupUrls: string[];
  /** 实际取到的音质 id。 */
  quality: number;
  codecs: string | null;
  mimeType: string | null;
  /** 容器形态：dash 分片（fMP4）或 durl 整段。 */
  container: 'dash' | 'durl';
  /** B 站自报时长（秒），dash 分片常为 0。 */
  durationSeconds: number | null;
}

/** 搜索结果的标题带 `<em class="keyword">` 高亮标签，去掉它们。 */
export function stripHtmlTags(text: string | undefined): string {
  if (text === undefined) return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .trim();
}

/** `MM:SS` / `HH:MM:SS` → 秒。解析不出来返回 null。 */
export function parseDurationText(text: string | undefined): number | null {
  if (text === undefined || text.trim() === '') return null;
  const parts = text.trim().split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return seconds;
}
