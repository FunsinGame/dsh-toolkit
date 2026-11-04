/**
 * Module-level state for the image tool.
 *
 * The toolbox page unmounts when the user opens the conversation, but a loaded
 * image pair is expensive to recreate (and the files cannot be re-read by the
 * plugin). Keeping the pair — and the view choices — here means coming back to
 * the toolbox returns to the exact comparison the user left.
 *
 * Object URLs are revoked only when a slot is replaced or cleared, or when the
 * plugin is disposed; the component itself never owns their lifetime.
 */

import type { AlignMode, LoadedImage } from './diff'

export type CompareMode = 'split' | 'slider' | 'fade' | 'blink' | 'difference' | 'highlight'

export interface ImageToolState {
  readonly a: LoadedImage | null
  readonly b: LoadedImage | null
  readonly mode: CompareMode
  readonly align: AlignMode
  readonly threshold: number
  readonly gain: number
  readonly fade: number
  readonly sliderRatio: number
  readonly blinkMs: number
  readonly showGray: boolean
}

const DEFAULTS: ImageToolState = {
  a: null,
  b: null,
  mode: 'split',
  align: 'contain',
  threshold: 12,
  gain: 4,
  fade: 50,
  sliderRatio: 0.5,
  blinkMs: 500,
  showGray: true,
}

let state: ImageToolState = { ...DEFAULTS }

export function readImageState(): ImageToolState {
  return state
}

export function rememberImageState(patch: Partial<ImageToolState>): void {
  state = { ...state, ...patch }
}

/** Release both object URLs and reset to the empty comparison. */
export function disposeImageState(): void {
  if (state.a !== null) URL.revokeObjectURL(state.a.url)
  if (state.b !== null) URL.revokeObjectURL(state.b.url)
  state = { ...DEFAULTS }
}
