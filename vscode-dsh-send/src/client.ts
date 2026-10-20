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

/**
 * POST one insertion request to a live instance.
 * @param instance - discovered instance endpoint and capability token.
 * @param request - content to insert.
 * @param cwd - the VS Code workspace, used as a Session tiebreaker.
 * @returns the Host answer.
 * @throws when the Host cannot be reached or answers outside the protocol.
 */
export async function insert(
  instance: DshInstance,
  request: InsertRequest,
  cwd: string | undefined,
): Promise<InsertResponse> {
  const response = await fetch(`${instance.url}/external-input/v1/insert`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${instance.token}`,
    },
    body: JSON.stringify({ ...request, ...(cwd === undefined ? {} : { cwd }) }),
  })
  if (!response.ok) throw new Error(`DSH answered HTTP ${String(response.status)}`)
  return await response.json() as InsertResponse
}
