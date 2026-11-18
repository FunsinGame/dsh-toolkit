/**
 * The one HTTP call the extension makes: ask a running Host to place content
 * in the composer of its active Session, and read the Client's acknowledgement.
 */

import type { DshInstance } from './discovery'

/** Content the Host is asked to insert. */
export interface InsertRequest {
  readonly kind: 'file' | 'text'
  /** Absolute file path for `kind: 'file'`. */
  readonly path?: string
  /** 1-based first line of the referenced range. */
  readonly startLine?: number
  /** 1-based last line of the referenced range. */
  readonly endLine?: number
  /** Plain text for `kind: 'text'`. */
  readonly text?: string
}

/** The Host route's answer after (or without) a Client ack. */
export interface InsertResponse {
  readonly accepted?: boolean
  readonly ok?: boolean
  readonly sessionId?: string
  readonly error?: string
  readonly ack?: string
}

/** A Host answer outside the protocol, carrying the status that produced it. */
export class DshHttpError extends Error {
  /** The HTTP status the Host answered with. */
  readonly status: number

  /**
   * Record one rejected request.
   * @param status - the answered HTTP status.
   */
  constructor(status: number) {
    super(`DSH answered HTTP ${String(status)}`)
    this.name = 'DshHttpError'
    this.status = status
  }
}

/**
 * POST one insertion request to a live instance.
 * @param instance - discovered instance endpoint and capability token.
 * @param request - content to insert.
 * @param cwd - the VS Code workspace, used as a Session tiebreaker.
 * @param cookie - optional web-session cookie, required by DSH 0.2.2 and later.
 * @returns the Host answer.
 * @throws {DshHttpError} when the Host answers outside the protocol.
 */
export async function insert(
  instance: DshInstance,
  request: InsertRequest,
  cwd: string | undefined,
  cookie: string | undefined = undefined,
): Promise<InsertResponse> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${instance.token}`,
  }
  if (cookie !== undefined) headers.cookie = cookie
  const response = await fetch(`${instance.url}/external-input/v1/insert`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...request, ...(cwd === undefined ? {} : { cwd }) }),
  })
  if (!response.ok) throw new DshHttpError(response.status)
  return await response.json() as InsertResponse
}
