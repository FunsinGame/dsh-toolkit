/**
 * 媒体登记表。
 *
 * 回环代理**只**按这里的 id 取数据，绝不接受客户端传入的 URL——这既是防 SSRF，
 * 也是防止本机其它进程把我们的服务当成开放代理。
 *
 * 解码后的 WAV 直接放内存（一首 4 分钟约 26MB），因此条目要带 TTL 并做容量上限，
 * 否则连着听一晚会把扩展宿主撑爆。
 */

import { randomBytes } from 'node:crypto';

import { GrowingBuffer } from './growingBuffer';

export type MediaKind = 'audio' | 'image';

export interface MediaEntry {
  id: string;
  kind: MediaKind;
  /** 内存字节；与 `upstreamUrl` / `growing` 三选一。 */
  bytes: Buffer | null;
  /** 上游地址（图片走代理时使用）。 */
  upstreamUrl: string | null;
  /** 边写边播的缓冲（流式起播）。 */
  growing: GrowingBuffer | null;
  contentType: string;
  /** 诊断用的人类可读标签。 */
  label: string;
  createdAt: number;
  expiresAt: number;
  /** 越大越不容易被淘汰。 */
  priority: number;
}

export interface RegisterOptions {
  kind: MediaKind;
  bytes?: Buffer;
  upstreamUrl?: string;
  contentType: string;
  label?: string;
  ttlMs?: number;
  priority?: number;
}

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

export class MediaStore {
  private readonly entries = new Map<string, MediaEntry>();

  constructor(private readonly maxTotalBytes = 512 * 1024 * 1024) {}

  /** 登记一个条目，返回可用于 URL 的 id。 */
  register(options: RegisterOptions): string {
    const id = randomBytes(12).toString('hex');
    const now = Date.now();
    this.entries.set(id, {
      id,
      kind: options.kind,
      bytes: options.bytes ?? null,
      upstreamUrl: options.upstreamUrl ?? null,
      growing: null,
      contentType: options.contentType,
      label: options.label ?? '',
      createdAt: now,
      expiresAt: now + (options.ttlMs ?? DEFAULT_TTL_MS),
      priority: options.priority ?? 0,
    });
    this.enforceCapacity(now);
    return id;
  }

  /**
   * 登记一个「边写边播」的音频条目。
   *
   * 与 `register` 的区别：容量先定下来（按预测时长算），字节由调用方通过
   * `entry.growing.append()` 陆续写入，代理会在数据还没写到的位置等一下。
   */
  registerGrowing(options: {
    capacity: number;
    contentType: string;
    label?: string;
    ttlMs?: number;
    priority?: number;
  }): { id: string; entry: MediaEntry; growing: GrowingBuffer } {
    const id = randomBytes(12).toString('hex');
    const now = Date.now();
    const growing = new GrowingBuffer({ capacity: options.capacity });
    const entry: MediaEntry = {
      id,
      kind: 'audio',
      bytes: null,
      upstreamUrl: null,
      growing,
      contentType: options.contentType,
      label: options.label ?? '',
      createdAt: now,
      expiresAt: now + (options.ttlMs ?? DEFAULT_TTL_MS),
      priority: options.priority ?? 0,
    };
    this.entries.set(id, entry);
    return { id, entry, growing };
  }

  get(id: string): MediaEntry | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(id);
      return undefined;
    }
    return entry;
  }

  delete(id: string): boolean {
    return this.entries.delete(id);
  }

  /** 清掉过期条目，返回清掉的个数。 */
  sweep(now = Date.now()): number {
    let removed = 0;
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(id);
        removed++;
      }
    }
    return removed;
  }

  /** 全部清空（`clearCache` 命令 / 卸载时用）。 */
  clear(): void {
    this.entries.clear();
  }

  get totalBytes(): number {
    let total = 0;
    for (const entry of this.entries.values()) {
      total += entry.bytes?.byteLength ?? entry.growing?.capacity ?? 0;
    }
    return total;
  }

  get size(): number {
    return this.entries.size;
  }

  stats(): { entries: number; totalBytes: number; audioEntries: number } {
    let audioEntries = 0;
    for (const entry of this.entries.values()) {
      if (entry.kind === 'audio') audioEntries++;
    }
    return { entries: this.entries.size, totalBytes: this.totalBytes, audioEntries };
  }

  /** 超出容量时按「优先级 → 最久未创建」淘汰。 */
  private enforceCapacity(now: number): void {
    if (this.totalBytes <= this.maxTotalBytes) return;
    const ordered = [...this.entries.values()].sort((left, right) => {
      if (left.priority !== right.priority) return left.priority - right.priority;
      return left.createdAt - right.createdAt;
    });
    for (const entry of ordered) {
      if (this.totalBytes <= this.maxTotalBytes) break;
      this.entries.delete(entry.id);
    }
    this.sweep(now);
  }
}
