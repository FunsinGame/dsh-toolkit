/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-turn-navigator`.
 * @module @deepseek-ai/dsh-turn-navigator/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type InvariantService from '@deepseek-ai/dsh-invariants'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-turn-navigator'
type InvariantContext = Context & { invariants: InvariantService }

/** Cordis companion plugin name. */
export const name = 'turn-navigator-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the plugin owns no durable or cross-plugin mutable
 * state; its slot registration is an effect and all selection is derived from
 * the current conversation snapshot and DOM scroll position.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns The installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve((ctx as InvariantContext).invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
