/**
 * Framework-free annotation state.
 *
 * Kept out of React so the activity page can remount (switching back to the
 * conversation and returning) without losing the picture or the comments, and
 * so the numbering/staleness rules are unit-testable in plain Node.
 */

import { fitView, zoomAt, type Rect, type Size, type View } from './geometry.ts'

export interface ImageState {
  blob: Blob
  url: string
  width: number
  height: number
  mime: string
  name: string
}

export type Annotation =
  | {
      id: string
      kind: 'region'
      /** Where the content originally sat. Equals `rect` until the region is cut. */
      source: Rect
      /** Where the frame sits now; resizing and moving only change this. */
      rect: Rect
      text: string
      /** True once 「裁剪移动」 took the content out of the picture. */
      cut: boolean
    }
  | { id: string; kind: 'global'; text: string }

export type ExportStatus = 'idle' | 'running' | 'ready' | 'error'

export interface ExportState {
  status: ExportStatus
  prompt: string
  dir: string
  imagePath: string
  jsonPath: string
  error: string
  /** True when the comments changed after the prompt was produced. */
  stale: boolean
}

export interface State {
  image: ImageState | null
  annotations: Annotation[]
  selectedId: string | null
  view: View
  viewport: Size
  needsFit: boolean
  justAdded: string | null
  exportState: ExportState
}

function emptyExport(): ExportState {
  return { status: 'idle', prompt: '', dir: '', imagePath: '', jsonPath: '', error: '', stale: false }
}

function emptyView(): View {
  return { scale: 1, x: 0, y: 0 }
}

function initialState(): State {
  return {
    image: null,
    annotations: [],
    selectedId: null,
    view: emptyView(),
    viewport: { width: 0, height: 0 },
    needsFit: false,
    justAdded: null,
    exportState: emptyExport(),
  }
}

export type CommitResult = {
  dir: string
  imagePath: string
  jsonPath: string
  prompt: string
}

export class DesignMindStore {
  private state: State = initialState()
  private listeners = new Set<() => void>()
  private sequence = 0

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): State => this.state

  private update(patch: Partial<State>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of [...this.listeners]) listener()
  }

  private nextId(prefix: string): string {
    this.sequence += 1
    return `${prefix}${this.sequence}`
  }

  /** Replace the picture, dropping annotations and any previous export. */
  setImage(image: Omit<ImageState, 'url'> & { url: string }): void {
    const previous = this.state.image
    if (previous !== null && previous.url !== image.url && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(previous.url)
    }
    this.update({
      image,
      annotations: [],
      selectedId: null,
      view: emptyView(),
      needsFit: true,
      justAdded: null,
      exportState: emptyExport(),
    })
  }

  addRegion(rect: Rect): string {
    const id = this.nextId('r')
    this.update({
      ...this.withAnnotations([
        ...this.state.annotations,
        { id, kind: 'region', source: rect, rect, text: '', cut: false },
      ]),
      selectedId: id,
      justAdded: id,
    })
    return id
  }

  /** Move or resize a frame. An uncut region follows the pointer as a whole; a
   * cut one keeps `source` so the export can describe the movement. */
  setRegionRect(id: string, rect: Rect): void {
    let changed = false
    const annotations = this.state.annotations.map((annotation) => {
      if (annotation.id !== id || annotation.kind !== 'region') return annotation
      if (
        annotation.rect.x1 === rect.x1 &&
        annotation.rect.y1 === rect.y1 &&
        annotation.rect.x2 === rect.x2 &&
        annotation.rect.y2 === rect.y2
      ) {
        return annotation
      }
      changed = true
      return annotation.cut
        ? { ...annotation, rect }
        : { ...annotation, rect, source: rect }
    })
    if (!changed) return
    this.update(this.withAnnotations(annotations))
  }

  /** Take the region's content out of the picture so it can be dragged away. */
  cutRegion(id: string): void {
    let changed = false
    const annotations = this.state.annotations.map((annotation) => {
      if (annotation.id !== id || annotation.kind !== 'region' || annotation.cut) return annotation
      changed = true
      return { ...annotation, cut: true, source: annotation.rect }
    })
    if (!changed) return
    this.update({ ...this.withAnnotations(annotations), selectedId: id })
  }

  addGlobal(): string {
    const id = this.nextId('g')
    this.update({
      ...this.withAnnotations([...this.state.annotations, { id, kind: 'global', text: '' }]),
      selectedId: id,
      justAdded: id,
    })
    return id
  }

  setText(id: string, text: string): void {
    const annotations = this.state.annotations.map((annotation) =>
      annotation.id === id ? { ...annotation, text } : annotation,
    )
    this.update({ ...this.withAnnotations(annotations), justAdded: null })
  }

  remove(id: string): void {
    const annotations = this.state.annotations.filter((annotation) => annotation.id !== id)
    this.update({
      ...this.withAnnotations(annotations),
      selectedId: this.state.selectedId === id ? null : this.state.selectedId,
    })
  }

  clearAnnotations(): void {
    this.update({ ...this.withAnnotations([]), selectedId: null, justAdded: null })
  }

  select(id: string | null): void {
    if (this.state.selectedId === id) return
    this.update({ selectedId: id })
  }

  setViewport(viewport: Size): void {
    if (viewport.width === this.state.viewport.width && viewport.height === this.state.viewport.height) return
    this.update({ viewport })
  }

  setView(view: View): void {
    const { image, viewport } = this.state
    if (image === null || viewport.width === 0) {
      this.update({ view, needsFit: false })
      return
    }
    this.update({ view, needsFit: false })
  }

  fit(): void {
    const { image, viewport } = this.state
    if (image === null || viewport.width === 0 || viewport.height === 0) return
    this.update({ view: fitView({ width: image.width, height: image.height }, viewport), needsFit: false })
  }

  requestFit(): void {
    this.update({ needsFit: true })
  }

  zoomBy(factor: number): void {
    const { image, view, viewport } = this.state
    if (image === null || viewport.width === 0) return
    this.update({
      view: zoomAt(view, view.scale * factor, { x: viewport.width / 2, y: viewport.height / 2 }),
    })
  }

  exportStart(): void {
    this.update({ exportState: { ...emptyExport(), status: 'running' } })
  }

  exportReady(result: CommitResult): void {
    this.update({
      exportState: {
        status: 'ready',
        prompt: result.prompt,
        dir: result.dir,
        imagePath: result.imagePath,
        jsonPath: result.jsonPath,
        error: '',
        stale: false,
      },
    })
  }

  exportFailed(message: string): void {
    this.update({ exportState: { ...emptyExport(), status: 'error', error: message } })
  }

  exportIdle(): void {
    this.update({ exportState: emptyExport() })
  }

  /** Comment mutations invalidate an already-produced prompt, but keep it visible. */
  private withAnnotations(annotations: Annotation[]): Partial<State> {
    const exportState = this.state.exportState
    return {
      annotations,
      exportState:
        exportState.status === 'ready' && !exportState.stale
          ? { ...exportState, stale: true }
          : exportState,
    }
  }
}
