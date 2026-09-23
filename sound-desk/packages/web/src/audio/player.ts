/**
 * Playback engine.
 *
 * Design notes:
 *  - Playback streams from `/api/media/:id/stream` through an <audio> element
 *    wired into the Web Audio graph. That gives instant start and arbitrary
 *    seeking (the engine serves Range requests) without decoding whole files
 *    into memory the way `decodeAudioData` would.
 *  - Tape-style speed change is `playbackRate` with pitch preservation OFF,
 *    which is exactly the "faster and brighter / slower and deeper" behaviour
 *    the reference product describes.
 *  - Reverse needs the samples, so it is implemented by decoding the buffer
 *    and swapping to an AudioBufferSourceNode. Selections, loops and rate all
 *    keep working in that mode; the two modes just have different sources.
 *  - The AudioContext is created lazily on the first user gesture, because
 *    browsers refuse to start audio otherwise.
 */

export interface PlayerState {
  assetId: number | null;
  playing: boolean;
  /** seconds */
  position: number;
  duration: number;
  /** 1 = normal */
  rate: number;
  volume: number;
  muted: boolean;
  loop: boolean;
  reverse: boolean;
  /** selection in seconds; when set, playback is confined to it */
  selection: { start: number; end: number } | null;
  ready: boolean;
  error: string | null;
}

export type PlayerListener = (state: PlayerState) => void;

export class Player {
  private audio: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private bufferSource: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private rafHandle: number | null = null;
  private listeners = new Set<PlayerListener>();
  private state: PlayerState = {
    assetId: null,
    playing: false,
    position: 0,
    duration: 0,
    rate: 1,
    volume: 1,
    muted: false,
    loop: false,
    reverse: false,
    selection: null,
    ready: false,
    error: null,
  };

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.crossOrigin = 'anonymous';
    this.audio.addEventListener('timeupdate', () => this.syncFromElement());
    this.audio.addEventListener('durationchange', () => {
      if (Number.isFinite(this.audio.duration)) this.patch({ duration: this.audio.duration });
    });
    this.audio.addEventListener('ended', () => {
      if (this.state.loop && !this.state.selection) {
        this.audio.currentTime = 0;
        void this.audio.play();
        return;
      }
      this.patch({ playing: false });
      this.stopClock();
    });
    this.audio.addEventListener('play', () => {
      this.patch({ playing: true });
      this.startClock();
    });
    this.audio.addEventListener('pause', () => {
      this.patch({ playing: false });
      this.stopClock();
    });
    this.audio.addEventListener('error', () => {
      this.patch({ error: 'audio element failed to load this file', ready: false, playing: false });
    });
  }

  getState(): PlayerState {
    return { ...this.state };
  }

  subscribe(listener: PlayerListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private patch(partial: Partial<PlayerState>): void {
    this.state = { ...this.state, ...partial };
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }

  /** Must be called from a user gesture the first time. */
  private ensureContext(): AudioContext {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    const gain = ctx.createGain();
    gain.gain.value = this.state.muted ? 0 : this.state.volume;
    gain.connect(ctx.destination);

    // A media element can only ever be attached to one source node, so create
    // it exactly once and reuse it for every track.
    const source = ctx.createMediaElementSource(this.audio);
    source.connect(gain);

    this.ctx = ctx;
    this.gain = gain;
    this.source = source;
    return ctx;
  }

  async load(assetId: number, url: string): Promise<void> {
    this.stop();
    this.buffer = null;
    this.patch({ assetId, ready: false, error: null, position: 0, duration: 0, selection: null });
    this.audio.src = url;
    this.audio.playbackRate = this.state.rate;
    this.audio.loop = false;
    try {
      await new Promise<void>((resolve, reject) => {
        const onLoaded = (): void => {
          cleanup();
          resolve();
        };
        const onError = (): void => {
          cleanup();
          reject(new Error('failed to load audio'));
        };
        const cleanup = (): void => {
          this.audio.removeEventListener('loadedmetadata', onLoaded);
          this.audio.removeEventListener('error', onError);
        };
        this.audio.addEventListener('loadedmetadata', onLoaded);
        this.audio.addEventListener('error', onError);
      });
      this.patch({ ready: true, duration: Number.isFinite(this.audio.duration) ? this.audio.duration : 0 });
    } catch (err) {
      this.patch({ ready: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  async play(): Promise<void> {
    if (!this.state.ready && !this.buffer) return;
    try {
      this.ensureContext();
      if (this.state.reverse) {
        await this.playReversed();
        return;
      }
      this.stopBufferSource();
      if (this.state.selection) {
        const { start, end } = this.state.selection;
        if (this.audio.currentTime < start || this.audio.currentTime >= end) this.audio.currentTime = start;
      }
      await this.audio.play();
    } catch (err) {
      this.patch({ error: describePlaybackError(err), playing: false });
    }
  }

  pause(): void {
    this.audio.pause();
    this.stopBufferSource();
    this.stopClock();
    this.patch({ playing: false });
  }

  stop(): void {
    this.pause();
    try {
      this.audio.removeAttribute('src');
      this.audio.load();
    } catch {
      /* element may already be detached */
    }
    this.buffer = null;
    this.stopBufferSource();
  }

  seek(seconds: number): void {
    const clamped = Math.max(0, Math.min(seconds, this.state.duration || seconds));
    this.audio.currentTime = clamped;
    this.patch({ position: clamped });
    if (this.state.playing && this.state.reverse) {
      // restart the reversed buffer from the new offset
      void this.playReversed(clamped);
    }
  }

  /** Tape-style: speed and pitch move together. */
  setRate(rate: number): void {
    const clamped = Math.max(0.25, Math.min(4, rate));
    this.audio.playbackRate = clamped;
    if (this.bufferSource) this.bufferSource.playbackRate.value = clamped;
    this.patch({ rate: clamped });
  }

  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.audio.volume = this.state.muted ? 0 : clamped;
    if (this.gain) this.gain.gain.value = this.state.muted ? 0 : clamped;
    this.patch({ volume: clamped });
  }

  setMuted(muted: boolean): void {
    this.audio.volume = muted ? 0 : this.state.volume;
    if (this.gain) this.gain.gain.value = muted ? 0 : this.state.volume;
    this.patch({ muted });
  }

  setLoop(loop: boolean): void {
    this.patch({ loop });
  }

  setSelection(selection: { start: number; end: number } | null): void {
    this.patch({ selection });
  }

  async setReverse(reverse: boolean): Promise<void> {
    if (reverse === this.state.reverse) return;
    const wasPlaying = this.state.playing;
    const position = this.state.position;
    this.patch({ reverse });
    this.audio.pause();
    this.stopBufferSource();
    if (reverse && wasPlaying) await this.playReversed(position);
    else if (!reverse && wasPlaying) await this.play();
  }

  /** Monotonic clock for the playhead, cheaper and smoother than timeupdate. */
  private startClock(): void {
    if (this.rafHandle !== null) return;
    const tick = (): void => {
      const position = this.state.reverse ? this.reversedPosition() : this.audio.currentTime;
      if (this.state.selection) {
        const { end } = this.state.selection;
        if (!this.state.reverse && position >= end) {
          if (this.state.loop) {
            this.audio.currentTime = this.state.selection.start;
          } else {
            this.audio.pause();
          }
        }
        if (this.state.reverse && position <= this.state.selection.start && this.state.loop) {
          this.audio.currentTime = end;
        }
      }
      if (!this.state.reverse) this.patch({ position });
      this.rafHandle = window.requestAnimationFrame(tick);
    };
    this.rafHandle = window.requestAnimationFrame(tick);
  }

  private stopClock(): void {
    if (this.rafHandle !== null) {
      window.cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  private syncFromElement(): void {
    if (!this.state.reverse) this.patch({ position: this.audio.currentTime });
  }

  // -- reverse playback --------------------------------------------------

  private reversedStartedAt = 0;
  private reversedFrom = 0;

  private async playReversed(fromSeconds?: number): Promise<void> {
    const ctx = this.ensureContext();
    if (!this.buffer) {
      // Fetch and decode once; reversed playback needs the samples.
      const url = this.audio.src;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`could not fetch audio for reverse playback (${res.status})`);
      const bytes = await res.arrayBuffer();
      this.buffer = await ctx.decodeAudioData(bytes);
      this.patch({ duration: this.buffer.duration });
    }
    const buffer = this.buffer;
    if (!buffer) throw new Error('no decoded buffer');

    this.stopBufferSource();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.state.rate;
    source.connect(this.gain ?? ctx.destination);

    const start = fromSeconds ?? this.state.selection?.end ?? this.state.position ?? buffer.duration;
    const end = this.state.selection?.start ?? 0;

    // Reverse by playing the buffer backwards: swap the offset and negate rate.
    const offsetFromEnd = Math.max(0, buffer.duration - Math.min(start, buffer.duration));
    source.playbackRate.value = -Math.abs(this.state.rate);

    source.onended = () => {
      if (this.state.loop) {
        void this.playReversed(this.state.selection?.end ?? buffer.duration);
      } else {
        this.patch({ playing: false });
        this.stopClock();
      }
    };

    source.start(0, buffer.duration - offsetFromEnd);
    void end;
    this.bufferSource = source;
    this.reversedStartedAt = ctx.currentTime;
    this.reversedFrom = Math.min(start, buffer.duration);
    this.patch({ playing: true });
    this.startClock();
  }

  private reversedPosition(): number {
    const elapsed = (this.ctx?.currentTime ?? this.reversedStartedAt) - this.reversedStartedAt;
    const position = this.reversedFrom - elapsed * this.state.rate;
    const floor = this.state.selection?.start ?? 0;
    return Math.max(floor, position);
  }

  private stopBufferSource(): void {
    if (this.bufferSource) {
      try {
        this.bufferSource.onended = null;
        this.bufferSource.stop();
      } catch {
        /* already stopped */
      }
      this.bufferSource.disconnect();
      this.bufferSource = null;
    }
  }
}

let singleton: Player | null = null;

/** One player per app — audio should never overlap across views. */
export function getPlayer(): Player {
  if (!singleton) singleton = new Player();
  return singleton;
}

/**
 * Turn a DOMException into something a person can act on.
 *
 * The autoplay case matters: browsers refuse to start audio without a user
 * gesture, and the raw message ("play() failed because the user didn't
 * interact…") reads like a bug in the app rather than a browser policy.
 */
function describePlaybackError(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  if (name === 'NotAllowedError' || /user (didn't|did not) interact|not allowed/i.test(message)) {
    return '浏览器阻止了自动播放，点一下播放按钮即可';
  }
  if (name === 'NotSupportedError' || /no supported source/i.test(message)) {
    return '这个格式无法直接播放（需要 ffmpeg 转码）';
  }
  return message;
}
