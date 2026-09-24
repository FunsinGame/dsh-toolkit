/**
 * 播放位置采样器。
 *
 * webview 每隔一段时间上报一次播放位置，这里把它记录下来，供自检在「隐藏侧边栏
 * 前后」比较位置推进量。之所以不直接问 webview「你还在放吗」，是因为隐藏状态下
 * 宿主→webview 的消息投递并不可靠，而 webview→宿主的上报是持续的。
 */

export interface PlaybackSample {
  playing: boolean;
  /** 秒。 */
  position: number;
  /** 采样时刻（毫秒时间戳）。 */
  at: number;
  /** 累计收到的上报次数——隐藏后这个计数是否增长也是判断依据。 */
  reportCount: number;
  /** 距离最后一次上报的毫秒数。 */
  ageMs: number;
}

export class PlaybackSampler {
  private last = { playing: false, position: 0, at: 0 };
  private count = 0;

  /** webview 上报时调用。 */
  record(playing: boolean, position: number, at: number = Date.now()): void {
    this.count += 1;
    this.last = { playing, position: Number.isFinite(position) ? position : 0, at };
  }

  reset(): void {
    this.last = { playing: false, position: 0, at: 0 };
    this.count = 0;
  }

  sample(now: number = Date.now()): PlaybackSample {
    return {
      playing: this.last.playing,
      position: this.last.position,
      at: this.last.at,
      reportCount: this.count,
      ageMs: this.last.at === 0 ? Number.POSITIVE_INFINITY : now - this.last.at,
    };
  }

  /** 等到「正在播放且位置超过 minPosition」，超时返回最后一次采样。 */
  async waitForPlaying(
    minPosition = 0.5,
    timeoutMs = 30_000,
    pollMs = 250,
    sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ): Promise<PlaybackSample> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const sample = this.sample();
      if (sample.playing && sample.position >= minPosition) return sample;
      if (Date.now() >= deadline) return sample;
      await sleep(pollMs);
    }
  }
}
