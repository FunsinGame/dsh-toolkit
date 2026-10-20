/** Error types shared by the web app, the DSH page and the host plugin. */

export class NotesApiError extends Error {
  readonly status: number
  readonly code: string
  readonly payload: unknown

  constructor(message: string, options: { status?: number; code?: string; payload?: unknown } = {}) {
    super(message)
    this.name = 'NotesApiError'
    this.status = options.status ?? 0
    this.code = options.code ?? 'REQUEST_FAILED'
    this.payload = options.payload
  }
}

export class AuthRequiredError extends NotesApiError {
  constructor(message = '需要登录') {
    super(message, { status: 401, code: 'AUTH_REQUIRED' })
    this.name = 'AuthRequiredError'
  }
}

export function isAuthError(error: unknown): boolean {
  return error instanceof NotesApiError && (error.status === 401 || error.code === 'AUTH_REQUIRED')
}

export function isConflictError(error: unknown): boolean {
  return error instanceof NotesApiError && (error.status === 409 || error.code === 'REVISION_CONFLICT')
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
