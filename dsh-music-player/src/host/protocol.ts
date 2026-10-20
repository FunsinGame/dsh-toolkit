/** Shared host-side protocol types for the audio pipeline. */

export type PrepareStage = 'queued' | 'fetch' | 'demux' | 'decode' | 'cache' | 'ready'

export type PlayMode = 'sequential' | 'repeat-all' | 'repeat-one' | 'shuffle'

export interface TrackSummary {
  bvid: string
  cid?: number
  title: string
  author: string
  cover: string
  durationSeconds: number
  pageCount: number
  favoriteId?: number
  invalid?: boolean
}
