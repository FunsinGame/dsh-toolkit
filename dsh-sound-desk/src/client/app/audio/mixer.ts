/**
 * Live multi-track preview.
 *
 * Plays up to four assets at once, each through its own effect chain, with its
 * own fader, pan and start offset. It is deliberately a sibling of `Player`
 * rather than a mode inside it: a single streamed `<audio>` element and a set of
 * decoded, scheduled buffer sources have almost nothing in common, and merging
 * them would mean every control in `Player` asking "which mode am I in".
 *
 * The two share one `AudioContext` and therefore one output. The transport pauses
 * whichever is not in use, so they never sound at once.
 *
 * Export does not go through this class: `renderMix` rebuilds the same graph in an
 * `OfflineAudioContext`. What this class provides is the audition of that mix.
 */

import {
  buildChain,
  normalizeChain,
  normalizeTracks,
  MAX_TRACKS,
  type ChainGraph,
  type EffectChain,
  type MixTrackInput,
} from '@sounddesk/audio-effects';

import { getPlayer } from './player.ts';

export interface MixerTrack {
  id: string;
  assetId: number;
  label: string;
  volume: number;
  pan: number;
  startSeconds: number;
  trimStartSeconds: number;
  trimLengthSeconds: number | null;
  mute: boolean;
  solo: boolean;
  chain: EffectChain;
  /** decoded source; null until `load()` has fetched it */
  buffer: AudioBuffer | null;
  loadError: string | null;
}

export interface MixerState {
  tracks: MixerTrack[];
  playing: boolean;
  /** position of the mix, in seconds */
  position: number;
  /** total length, from the offsets and the loaded buffers */
  duration: number;
  loading: boolean;
  error: string | null;
}

export type MixerListener = (state: MixerState) => void;

/** How a new track is staggered in when the user does not set an offset. */
export type StaggerMode = 'sequential' | 'overlap' | 'together';

interface ActiveVoice {
  /** which track this voice is playing, so a change can target the right one */
  trackId: string;
  source: AudioBufferSourceNode;
  graph: ChainGraph;
  panner: StereoPannerNode;
}

let instance: Mixer | null = null;
let nextId = 1;

export class Mixer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: ActiveVoice[] = [];
  private tracks: MixerTrack[] = [];
  private listeners = new Set<MixerListener>();
  private startedAt = 0;
  /** master fader, kept here because reading it back off the node is unreliable */
  private masterVolume = 1;
  private rafHandle: number | null = null;
  private state: MixerState = {
    tracks: [],
    playing: false,
    position: 0,
    duration: 0,
    loading: false,
    error: null,
  };

  getState(): MixerState {
    return { ...this.state, tracks: this.tracks.map((t) => ({ ...t })) };
  }

  subscribe(listener: MixerListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private patch(partial: Partial<MixerState>): void {
    this.state = { ...this.state, ...partial };
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }

  /** Must be called from a user gesture the first time, like `Player`. */
  private ensureContext(): AudioContext {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    return ctx;
  }

  get trackCount(): number {
    return this.tracks.length;
  }

  get canAdd(): boolean {
    return this.tracks.length < MAX_TRACKS;
  }

  /**
   * Add a track and decode it.
   *
   * Requires a user gesture for the first call, because decoding needs an
   * AudioContext and browsers refuse to start one otherwise. The caller is a
   * click handler, so that is satisfied naturally.
   */
  async addTrack(params: {
    assetId: number;
    label: string;
    url: string;
    chain?: EffectChain;
    startSeconds?: number;
    stagger?: StaggerMode;
  }): Promise<void> {
    if (!this.canAdd) {
      this.patch({ error: `最多 ${MAX_TRACKS} 轨` });
      return;
    }
    const ctx = this.ensureContext();
    const track: MixerTrack = {
      id: `mix-${nextId++}`,
      assetId: params.assetId,
      label: params.label,
      volume: 1,
      pan: 0,
      startSeconds: params.startSeconds ?? this.nextOffset(params.stagger ?? 'sequential'),
      trimStartSeconds: 0,
      trimLengthSeconds: null,
      mute: false,
      solo: false,
      chain: normalizeChain(params.chain),
      buffer: null,
      loadError: null,
    };
    this.tracks.push(track);
    this.patch({ loading: true, error: null, tracks: this.tracks.map((t) => ({ ...t })) });

    try {
      const res = await fetch(params.url);
      if (!res.ok) throw new Error(`读取失败（${res.status}）`);
      const bytes = await res.arrayBuffer();
      // decodeAudioData detaches the buffer it is given, so nothing may reuse it.
      track.buffer = await ctx.decodeAudioData(bytes);
    } catch (err) {
      track.loadError = err instanceof Error ? err.message : String(err);
    } finally {
      this.patch({ loading: false, duration: this.duration(), tracks: this.tracks.map((t) => ({ ...t })) });
    }
  }

  /**
   * Where the next track should start, given the tracks already present.
   *
   * `sequential` puts it after everything (to listen through candidates),
   * `overlap` half-way into the last one (to layer a sound up), `together` at
   * zero (to compare against the same attack).
   */
  private nextOffset(mode: StaggerMode): number {
    if (mode === 'together' || this.tracks.length === 0) return 0;
    const last = this.tracks[this.tracks.length - 1]!;
    const lastEnd = last.startSeconds + this.trackDuration(last);
    if (mode === 'overlap') return last.startSeconds + this.trackDuration(last) * 0.5;
    return lastEnd;
  }

  private trackDuration(track: MixerTrack): number {
    if (!track.buffer) return 0;
    const available = Math.max(0, track.buffer.duration - track.trimStartSeconds);
    return track.trimLengthSeconds === null ? available : Math.min(available, track.trimLengthSeconds);
  }

  duration(): number {
    let end = 0;
    for (const track of this.tracks) {
      if (track.mute) continue;
      end = Math.max(end, track.startSeconds + this.trackDuration(track));
    }
    return end;
  }

  /** Recompute the audible set whenever a track changes. */
  private audibleTracks(): MixerTrack[] {
    const anySolo = this.tracks.some((t) => t.solo);
    return this.tracks.filter((t) => (anySolo ? t.solo : !t.mute) && t.buffer !== null);
  }

  updateTrack(id: string, patch: Partial<Omit<MixerTrack, 'id' | 'buffer'>>): void {
    const track = this.tracks.find((t) => t.id === id);
    if (!track) return;
    const needsRestart =
      patch.startSeconds !== undefined ||
      patch.trimStartSeconds !== undefined ||
      patch.trimLengthSeconds !== undefined ||
      patch.chain !== undefined ||
      patch.mute !== undefined ||
      patch.solo !== undefined;

    Object.assign(track, patch);
    if (patch.chain) track.chain = normalizeChain(patch.chain);

    // Gain and pan can be applied to a sounding voice; timing and topology cannot,
    // so those edits restart the mix if it is playing.
    if (this.state.playing) {
      if (needsRestart) {
        const position = this.position();
        this.stopVoices();
        this.startVoices(position);
      } else {
        // Only this track's voice may move. Applying a change to every voice
        // would rewrite the other tracks' gains with this track's value.
        for (const voice of this.voices) {
          if (voice.trackId !== id) continue;
          this.applyLive(voice, track);
        }
      }
    }
    this.patch({ duration: this.duration(), tracks: this.tracks.map((t) => ({ ...t })) });
  }

  removeTrack(id: string): void {
    const index = this.tracks.findIndex((t) => t.id === id);
    if (index < 0) return;
    const wasPlaying = this.state.playing;
    const position = this.position();
    this.tracks.splice(index, 1);
    if (wasPlaying) {
      this.stopVoices();
      this.startVoices(position);
    }
    this.patch({ duration: this.duration(), tracks: this.tracks.map((t) => ({ ...t })) });
  }

  clear(): void {
    this.stop();
    this.tracks = [];
    this.patch({ duration: 0, position: 0, error: null, tracks: [] });
  }

  /**
   * Apply the live-controllable parameters of one track to its voice.
   *
   * Reads the mixer's own master volume rather than the node's `gain.value`:
   * reading back a value from an automated AudioParam is unreliable across
   * implementations, and the master fader is scheduled with a ramp.
   */
  private applyLive(voice: ActiveVoice, track: MixerTrack): void {
    const anySolo = this.tracks.some((t) => t.solo);
    const audible = anySolo ? track.solo : !track.mute;
    const target = track.chain.outputGain * (audible ? track.volume : 0) * this.masterVolume;
    const now = this.ctx?.currentTime ?? 0;
    const param = voice.graph.output.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + 0.02);
    voice.panner.pan.cancelScheduledValues(now);
    voice.panner.pan.setValueAtTime(voice.panner.pan.value, now);
    voice.panner.pan.linearRampToValueAtTime(track.pan, now + 0.02);
  }

  private startVoices(fromSeconds: number): void {
    const ctx = this.ensureContext();
    const master = this.master ?? ctx.destination;
    const audition = this.audibleTracks();
    for (const track of audition) {
      const buffer = track.buffer;
      if (!buffer) continue;
      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const graph = buildChain(ctx as unknown as Parameters<typeof buildChain>[0], track.chain, 0);
      const panner = ctx.createStereoPanner();
      panner.pan.value = track.pan;

      // The fader multiplies the chain's own output trim, matching renderMix, so
      // the preview level and the exported level are the same number.
      const anySolo = this.tracks.some((t) => t.solo);
      const audible = anySolo ? track.solo : !track.mute;
      graph.output.gain.value = track.chain.outputGain * (audible ? track.volume : 0) * this.masterVolume;

      source.connect(graph.input as unknown as AudioNode);
      graph.output.connect(panner as unknown as AudioNode);
      panner.connect(master as unknown as AudioNode);

      const length = this.trackDuration(track);
      const trackStart = track.startSeconds;
      // Where in the mix we are, expressed as an offset into this track.
      const elapsed = fromSeconds - trackStart;
      if (elapsed >= length) {
        graph.dispose();
        continue;
      }
      const offset = track.trimStartSeconds + Math.max(0, elapsed);
      const remaining = length - Math.max(0, elapsed);
      const when = ctx.currentTime + Math.max(0, trackStart - fromSeconds);

      graph.scheduleEnvelope(when, remaining);
      source.start(when, offset, remaining);
      this.voices.push({ trackId: track.id, source, graph, panner });
    }

    this.startedAt = ctx.currentTime - fromSeconds;
    this.patch({ playing: true });
    this.startClock();
  }

  private stopVoices(): void {
    for (const voice of this.voices) {
      try {
        voice.source.onended = null;
        voice.source.stop();
      } catch {
        /* already stopped */
      }
      voice.source.disconnect();
      voice.graph.dispose();
      voice.panner.disconnect();
    }
    this.voices = [];
    this.stopClock();
  }

  play(): void {
    if (this.tracks.length === 0) return;
    // The single-sound player and the mixer share one output; never both at once.
    getPlayer().pause();
    const ctx = this.ensureContext();
    this.stopVoices();
    const from = this.position() >= this.duration() - 1e-3 ? 0 : this.position();
    void ctx.resume();
    this.startVoices(from);
  }

  pause(): void {
    if (!this.state.playing) return;
    const position = this.position();
    this.stopVoices();
    this.patch({ playing: false, position });
  }

  stop(): void {
    this.stopVoices();
    this.patch({ playing: false, position: 0 });
  }

  seek(seconds: number): void {
    const clamped = Math.max(0, Math.min(seconds, this.duration()));
    if (this.state.playing) {
      this.stopVoices();
      this.startVoices(clamped);
    } else {
      this.patch({ position: clamped });
    }
  }

  position(): number {
    if (!this.state.playing || !this.ctx) return this.state.position;
    return Math.max(0, Math.min(this.ctx.currentTime - this.startedAt, this.duration()));
  }

  /** Redraw the playhead while sounding; cheaper and smoother than a timer. */
  private startClock(): void {
    if (this.rafHandle !== null) return;
    const tick = (): void => {
      const position = this.position();
      const duration = this.duration();
      if (position >= duration) {
        this.stopVoices();
        this.patch({ playing: false, position: duration });
        return;
      }
      this.patch({ position });
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

  /** The mixer's own output trim, so the master fader has somewhere to live. */
  setMasterVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.masterVolume = clamped;
    if (this.master) {
      const now = this.ctx?.currentTime ?? 0;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(clamped, now + 0.02);
    }
    // keep the per-track gains consistent with the new master level
    if (this.state.playing) {
      for (const voice of this.voices) {
        const track = this.tracks.find((t) => t.id === voice.trackId);
        if (track) this.applyLive(voice, track);
      }
    }
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  /** Tracks shaped for the offline renderer. */
  toMixTrackInputs(): MixTrackInput[] {
    return this.tracks
      .filter((t) => t.buffer !== null)
      .map((t) => ({
        id: t.id,
        assetId: t.assetId,
        label: t.label,
        volume: t.volume,
        pan: t.pan,
        startSeconds: t.startSeconds,
        trimStartSeconds: t.trimStartSeconds,
        trimLengthSeconds: t.trimLengthSeconds,
        mute: t.mute,
        solo: t.solo,
        chain: t.chain,
        audio: {
          // Copy the channels: `normalizeTracks` keeps a reference and the render
          // must not observe a buffer that playback is still using.
          channelData: Array.from({ length: t.buffer!.numberOfChannels }, (_, ch) =>
            new Float32Array(t.buffer!.getChannelData(ch)),
          ),
          sampleRate: t.buffer!.sampleRate,
        },
      }));
  }
}

export function getMixer(): Mixer {
  if (!instance) instance = new Mixer();
  return instance;
}

export { MAX_TRACKS, normalizeTracks };
