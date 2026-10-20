/**
 * DSH engine client.
 *
 * The workbench talks to the same SoundDesk engine the VS Code extension uses, but
 * through the plugin's same-origin route instead of a tokenised loopback origin:
 * the host proxy injects the session token, so the page never handles one.
 *
 * Two host differences are worth stating:
 *   - the engine's event WebSocket is not proxied; job progress is polled instead,
 *     which is indistinguishable at this scale and one less transport to break;
 *   - folder picking, file reveal and full-library import are host operations, so
 *     they go through the plugin's `/host/*` routes.
 */

import {
  HttpEngineClient,
  type EngineClient,
  type EngineEvent,
  type LibraryImportResult,
} from '../app/api/client.ts'

/** Same-origin mount point; `document.baseURI` also covers the desktop `dsh-app:` page. */
const MOUNT = new URL('dsh-sound-desk', document.baseURI).href

export interface HostStats {
  assets: number
  libraries: number
  embedded: number
  peaks: number
  totalBytes: number
}

export interface HostSettings {
  dataDir: string
  loadModel: boolean
  autoStart: boolean
  ffmpegPath: string
  referenceDir: string
  logLevel: 'off' | 'normal' | 'verbose'
}

export interface HostLogLine {
  at: number
  level: 'info' | 'warn' | 'error'
  text: string
}

export interface HostStatus {
  plugin: string
  version: string
  state: 'idle' | 'starting' | 'ready' | 'error'
  error: string | null
  restartRequired: boolean
  dataDir: string
  engineUrl: string | null
  modelLoaded: boolean
  modelId: string | null
  embedderError: string | null
  ffmpeg: string | null
  stats: HostStats | null
  settings: HostSettings
}

async function hostFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${MOUNT}/host/${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(init.headers ?? {}),
    },
  })
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    throw new Error(`宿主返回了非 JSON 响应（HTTP ${response.status}）`)
  }
  if (!response.ok) {
    const message = (payload as { error?: unknown })?.error
    throw new Error(typeof message === 'string' ? message : `请求失败（HTTP ${response.status}）`)
  }
  return payload as T
}

function post<T>(path: string, body: unknown): Promise<T> {
  return hostFetch<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

export class DshEngineClient extends HttpEngineClient implements EngineClient {
  private jobTimer: number | null = null
  private statsTimer: number | null = null
  private lastJobs = new Map<string, string>()
  private lastAssetCount = -1
  private started = false

  constructor() {
    // The token is a placeholder: the host proxy replaces it with the engine's real
    // per-run token before the request leaves the host process.
    super(MOUNT, 'dsh', { host: 'dsh', live: false })
  }

  /** Engine availability, and the switch that lets the host wait for a cold start. */
  status(wait = false): Promise<HostStatus> {
    return hostFetch<HostStatus>(`status${wait ? '?wait=1' : ''}`)
  }

  settings(): Promise<{ settings: HostSettings; dataDir: string; restartRequired: boolean }> {
    return hostFetch('settings')
  }

  saveSettings(patch: Partial<HostSettings>): Promise<{
    settings: HostSettings
    dataDir: string
    restartRequired: boolean
    engineState: string
  }> {
    return hostFetch('settings', { method: 'PUT', body: JSON.stringify(patch) })
  }

  restart(): Promise<{ ok: boolean; state: string }> {
    return post('restart', {})
  }

  logs(limit = 200): Promise<{ level: string; lines: HostLogLine[] }> {
    return hostFetch(`logs?limit=${limit}`)
  }

  pickFolder(title?: string): Promise<string | null> {
    return post<{ path: string | null; unsupported?: boolean; reason?: string }>('pick-folder', {
      ...(title === undefined ? {} : { title }),
    }).then((result) => {
      if (result.unsupported === true) throw new Error(result.reason ?? '当前宿主无法打开目录选择器')
      return result.path
    })
  }

  importLibrary(root: string, name?: string): Promise<LibraryImportResult> {
    return post<LibraryImportResult & { library: LibraryImportResult['library'] }>('import-library', {
      root,
      ...(name === undefined ? {} : { name }),
    })
  }

  override revealInSystem(assetId?: number): Promise<void> {
    if (assetId === undefined) return Promise.reject(new Error('缺少 assetId'))
    return post<{ ok: boolean }>('reveal', { assetId }).then(() => undefined)
  }

  override openInEditor(assetId?: number): Promise<void> {
    if (assetId === undefined) return Promise.reject(new Error('缺少 assetId'))
    return post<{ ok: boolean }>('open-file', { assetId }).then(() => undefined)
  }

  // -- event feed ---------------------------------------------------------

  /**
   * Poll the job list instead of holding a WebSocket.
   *
   * The engine broadcasts progress over its own WS; proxying an upgrade through
   * DSH's server is possible but buys nothing here — a 900 ms poll is already
   * faster than a scan step, and it survives a host restart for free.
   */
  override subscribe(onEvent: (event: EngineEvent) => void): () => void {
    const dispose = super.subscribe(onEvent)
    this.startPolling()
    return dispose
  }

  private startPolling(): void {
    if (this.started) return
    this.started = true
    this.emit({ type: 'connected' })
    const tickJobs = (): void => {
      void this.jobs()
        .then((jobs) => {
          for (const job of jobs) {
            const signature = `${job.state}:${job.done}:${job.failed}:${job.total}`
            if (this.lastJobs.get(job.id) === signature) continue
            this.lastJobs.set(job.id, signature)
            this.emit({ type: 'job', job })
          }
        })
        .catch(() => undefined)
    }
    const tickStats = (): void => {
      void this.stats()
        .then((stats) => {
          if (stats.assets === this.lastAssetCount) return
          const first = this.lastAssetCount === -1
          this.lastAssetCount = stats.assets
          if (!first) this.emit({ type: 'library.changed', libraryId: 0, assetCount: stats.assets })
        })
        .catch(() => undefined)
    }
    tickJobs()
    tickStats()
    this.jobTimer = window.setInterval(tickJobs, 900)
    this.statsTimer = window.setInterval(tickStats, 3500)
  }

  dispose(): void {
    if (this.jobTimer !== null) window.clearInterval(this.jobTimer)
    if (this.statsTimer !== null) window.clearInterval(this.statsTimer)
    this.jobTimer = null
    this.statsTimer = null
    this.started = false
  }
}

let client: DshEngineClient | null = null

export function getClient(): DshEngineClient {
  if (client === null) client = new DshEngineClient()
  return client
}

export { MOUNT }
