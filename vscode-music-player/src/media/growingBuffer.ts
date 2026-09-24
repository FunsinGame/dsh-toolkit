/**
 * 边写边播的缓冲区。
 *
 * 流式起播的关键：WAV 头部一写好、头几百 KB 的 PCM 一到位就可以让播放器开始，
 * 剩下的字节在后台继续追加。播放器（Chromium）会按 Range 连续来取，取到还没写好的
 * 位置时就等一下——这个「等」的语义全部收敛在这里，便于单测。
 *
 * 容量是提前算好的（按接口给的上游时长预测），因此不需要动态扩容；预测偏大时尾部
 * 补静音，偏小时尾部被截断（所以预测要向上取整、留余量，见 pipeline 里的 1%+0.5s）。
 */

export interface GrowingBufferOptions {
  capacity: number;
  /** 等数据的默认上限（毫秒）。 */
  defaultTimeoutMs?: number;
  now?: () => number;
}

interface Waiter {
  needed: number;
  resolve: (satisfied: boolean) => void;
  timer: NodeJS.Timeout;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export class GrowingBuffer {
  readonly buffer: Buffer;
  readonly capacity: number;
  private written = 0;
  private complete = false;
  private readonly waiters = new Set<Waiter>();
  private readonly defaultTimeoutMs: number;

  constructor(options: GrowingBufferOptions) {
    this.capacity = Math.max(0, Math.floor(options.capacity));
    this.buffer = Buffer.allocUnsafe(this.capacity);
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  get availableBytes(): number {
    return this.written;
  }

  get isComplete(): boolean {
    return this.complete;
  }

  /** 追加数据（顺序写入）。返回真正写入的字节数（超出容量会被截断）。 */
  append(chunk: Buffer): number {
    const remaining = this.capacity - this.written;
    if (remaining <= 0 || chunk.byteLength === 0) return 0;
    const accepted = chunk.byteLength <= remaining ? chunk : chunk.subarray(0, remaining);
    accepted.copy(this.buffer, this.written);
    this.written += accepted.byteLength;
    this.wake();
    return accepted.byteLength;
  }

  /** 标记数据已经写完（之后不再追加）。 */
  finish(): void {
    this.complete = true;
    for (const waiter of [...this.waiters]) {
      this.waiters.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(true);
    }
  }

  /**
   * 等到「已写字节数 ≥ needed」或数据写完；超时返回 false。
   * `needed` 超过容量时按容量处理（那种情况下只能等 finish）。
   */
  waitForAtLeast(needed: number, timeoutMs = this.defaultTimeoutMs): Promise<boolean> {
    const target = Math.min(Math.max(0, Math.floor(needed)), this.capacity);
    if (this.written >= target || this.complete) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const waiter: Waiter = {
        needed: target,
        resolve,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          resolve(false);
        }, timeoutMs),
      };
      waiter.timer.unref?.();
      this.waiters.add(waiter);
    });
  }

  /** 供测试与诊断：当前有多少个请求在等数据。 */
  get pendingWaiters(): number {
    return this.waiters.size;
  }

  private wake(): void {
    for (const waiter of [...this.waiters]) {
      if (this.written >= waiter.needed || this.complete) {
        this.waiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.resolve(true);
      }
    }
  }
}
