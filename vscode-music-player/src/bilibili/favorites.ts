/**
 * 收藏夹内容的归一化。
 *
 * 这一层刻意做成纯函数：B 站的收藏夹列表里混着「视频合集」「音频」等无法用
 * `playurl` 播放的条目，也有「已失效」（up 删除、其他原因删除）的视频。哪些该
 * 过滤、哪些该标注、时长字段到底是秒还是字符串——都在这里一次说清，并有单测兜住。
 */

import type { FavoriteContentItem, FavoriteContentsPage } from './types';

/** 收藏夹里能播放/展示的一条。 */
export interface FavoriteEntry {
  /** avid。 */
  avid: number;
  bvid: string;
  title: string;
  cover: string;
  upperName: string;
  /** 秒。收藏夹接口给的就是数字秒（搜索接口给的是 `MM:SS` 字符串，别混）。 */
  durationSeconds: number;
  /** 分 P 数量。 */
  pageCount: number;
  /** 已失效（up 删除 / 其他原因删除）：展示但禁止播放。 */
  invalid: boolean;
  /** 失效原因文案，正常时为 null。 */
  invalidReason: string | null;
}

export interface FavoriteContentsView {
  /** 收藏夹标题（info 缺失时为空）。 */
  title: string;
  /** 收藏夹内总条目数（B 站自报，含非视频项）。 */
  total: number;
  /** 归一化之后的条目（已过滤非视频项）。 */
  entries: FavoriteEntry[];
  hasMore: boolean;
}

/** 视频稿件。只有这种类型能用 `playurl` 播放。 */
const TYPE_VIDEO = 2;

/** `attr` → 失效原因。 */
export function describeInvalidAttr(attr: number): string | null {
  if (attr === 0) return null;
  if (attr === 9) return 'up 主已删除';
  if (attr === 1) return '已被删除或设为私密';
  return '已失效';
}

/** 单条内容 → 归一化条目；非视频稿件返回 null（调用方负责过滤）。 */
export function toFavoriteEntry(item: FavoriteContentItem): FavoriteEntry | null {
  if (item.type !== TYPE_VIDEO) return null;
  if (typeof item.bvid !== 'string' || item.bvid === '') return null;
  const reason = describeInvalidAttr(item.attr);
  return {
    avid: item.id,
    bvid: item.bvid,
    title: item.title ?? '',
    cover: item.cover ?? '',
    upperName: item.upper?.name ?? '',
    durationSeconds: Number.isFinite(item.duration) ? Math.max(0, Math.round(item.duration)) : 0,
    pageCount: Number.isFinite(item.page) ? Math.max(1, Math.round(item.page)) : 1,
    invalid: reason !== null,
    invalidReason: reason,
  };
}

/** 一页内容 → 视图模型。 */
export function toFavoriteContentsView(page: FavoriteContentsPage): FavoriteContentsView {
  const entries: FavoriteEntry[] = [];
  for (const item of page.medias ?? []) {
    const entry = toFavoriteEntry(item);
    if (entry !== null) entries.push(entry);
  }
  return {
    title: page.info?.title ?? '',
    total: page.info?.media_count ?? entries.length,
    entries,
    hasMore: page.has_more === true,
  };
}
