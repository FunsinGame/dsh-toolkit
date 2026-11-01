/** Same-origin calls to the host half. No credentials or tokens reach the page. */

import type { Rect } from './geometry.ts'

export interface CreateExportResult {
  exportId: string
  dir: string
}

export interface UploadResult {
  file: string
  mimeType: string
  width: number
  height: number
  sha256: string
  bytes: number
}

export interface CommitResult {
  dir: string
  imagePath: string
  jsonPath: string
  prompt: string
  schemaVersion: string
  count: number
}

export interface CommentPayload {
  kind: 'region' | 'global'
  /** Region only: where the content was taken from. */
  source?: Rect
  /** Region only: where the frame sits now; equal to `source` when not moved. */
  rect?: Rect
  text: string
}

export class DesignMindApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'DesignMindApiError'
    this.status = status
    this.code = code
  }
}

function mount(): string {
  try {
    return new URL('dsh-design-mind/', document.baseURI).href
  } catch {
    return '/dsh-design-mind/'
  }
}

function address(path: string): string {
  return new URL(path.replace(/^\/+/, ''), mount()).href
}

async function decode<T>(response: Response): Promise<T> {
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    throw new DesignMindApiError(`宿主返回了非 JSON 响应（HTTP ${response.status}）`, response.status, 'bad_response')
  }
  const body = payload as { ok?: boolean; error?: { code?: string; message?: string } } | null
  if (!response.ok || body === null || body.ok === false) {
    throw new DesignMindApiError(
      body?.error?.message ?? `请求失败（HTTP ${response.status}）`,
      response.status,
      body?.error?.code ?? 'host_failed',
    )
  }
  return payload as T
}

export async function createExport(): Promise<CreateExportResult> {
  const response = await fetch(address('exports'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'x-design-mind-request': '1' },
    body: '{}',
  })
  const data = await decode<{ exportId: string; dir: string }>(response)
  return { exportId: data.exportId, dir: data.dir }
}

export async function uploadImage(id: string, blob: Blob): Promise<UploadResult> {
  const response = await fetch(address(`exports/${encodeURIComponent(id)}/image`), {
    method: 'PUT',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      'content-type': blob.type !== '' ? blob.type : 'application/octet-stream',
      'x-design-mind-request': '1',
    },
    body: blob,
  })
  return decode<UploadResult>(response)
}

export async function commitExport(id: string, comments: CommentPayload[]): Promise<CommitResult> {
  const response = await fetch(address(`exports/${encodeURIComponent(id)}/commit`), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'x-design-mind-request': '1' },
    body: JSON.stringify({ objects: comments }),
  })
  return decode<CommitResult>(response)
}

export interface CleanResult {
  removed: number
  bytes: number
}

/** Ask the host to reveal the export root in the OS file manager. */
export async function revealExports(): Promise<{ dir: string }> {
  const response = await fetch(address('exports/open'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { accept: 'application/json', 'x-design-mind-request': '1' },
  })
  return decode<{ dir: string }>(response)
}

/** Delete every export this plugin created. */
export async function cleanExports(): Promise<CleanResult> {
  const response = await fetch(address('exports/clean'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { accept: 'application/json', 'x-design-mind-request': '1' },
  })
  return decode<CleanResult>(response)
}

export interface HostInfo {
  name: string
  version: string
}

/**
 * The host half is loaded once when DSH starts, while this bundle is loaded on
 * every page view. Comparing the two versions lets the page explain a 404 from
 * an older host instead of surfacing a bare "未找到".
 */
export async function hostInfo(): Promise<HostInfo> {
  const response = await fetch(address(''), {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  })
  return decode<HostInfo>(response)
}
