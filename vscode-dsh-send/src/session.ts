/**
 * The web-session credential a DSH Host requires before any named route runs.
 *
 * Since 0.2.2 the Host admits every route through `webserver/authorize` before
 * the route's own handler, and the external-input route declares no auth
 * policy, so it inherits `required`: a plain `Authorization: Bearer` header no
 * longer reaches it. The Host's token provider accepts a signed
 * `dsh-auth-<sha256(authority)>` cookie whose HMAC key is the browser-session
 * secret DSH stores in `$DSH_HOME/.credentials.yaml`. This module derives that
 * cookie locally, so the extension can present both credentials.
 */

import { createHash, createHmac } from 'node:crypto'

/** Cookie name prefix the Host's token provider mints under. */
const COOKIE_PREFIX = 'dsh-auth-'

/** Signed payload version the provider writes and accepts for browser sessions. */
const COOKIE_VERSION = 1

/**
 * Cookie lifetime. The provider rejects a cookie whose window exceeds the
 * configured `cookieMaxAgeDays` (one day minimum), so one day always fits
 * while staying short enough to be useless once discarded.
 */
const COOKIE_LIFETIME_MS = 24 * 60 * 60 * 1000

/** A browser-session secret must decode to this many bytes. */
const SESSION_SECRET_BYTES = 32

/**
 * Render bytes in the unpadded base64url alphabet the Host uses.
 * @param value - raw bytes.
 * @returns the encoded text.
 */
export function encodeBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

/**
 * Derive the cookie name for one authority, exactly as the Host does.
 * @param authority - the request's `Host` value, such as `127.0.0.1:56299`.
 * @returns the cookie name.
 */
function sessionCookieName(authority: string): string {
  return `${COOKIE_PREFIX}${encodeBase64Url(createHash('sha256').update(authority, 'utf8').digest())}`
}

/**
 * Whether a stored value is a well-formed browser-session secret.
 * @param value - decoded secret bytes.
 * @returns whether the length matches.
 */
export function isSessionSecret(value: Uint8Array): boolean {
  return value.byteLength === SESSION_SECRET_BYTES
}

/**
 * Mint one browser-session cookie the Host's token provider accepts.
 * @param authority - the request's `Host` value, such as `127.0.0.1:56299`.
 * @param secret - decoded browser-session secret bytes.
 * @param now - issue time in epoch milliseconds; defaults to the current time.
 * @returns a complete `name=value` cookie pair.
 */
export function mintSessionCookie(authority: string, secret: Uint8Array, now: number = Date.now()): string {
  // Key order is part of the signed body: the Host re-serializes nothing, it
  // verifies the signature over these exact bytes.
  const payload = JSON.stringify({
    version: COOKIE_VERSION,
    authority,
    issuedAt: now,
    expiresAt: now + COOKIE_LIFETIME_MS,
  })
  const body = encodeBase64Url(Buffer.from(payload, 'utf8'))
  const signature = createHmac('sha256', secret).update(body).digest()
  return `${sessionCookieName(authority)}=v${String(COOKIE_VERSION)}.${body}.${encodeBase64Url(signature)}`
}
