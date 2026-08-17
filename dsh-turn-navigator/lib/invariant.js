//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@deepseek-ai/dsh-turn-navigator`.
* @module @deepseek-ai/dsh-turn-navigator/invariant
*/
const PACKAGE_NAME = "@deepseek-ai/dsh-turn-navigator";
/** Cordis companion plugin name. */
const name = "turn-navigator-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: the plugin owns no durable or cross-plugin mutable
* state; its slot registration is an effect and all selection is derived from
* the current conversation snapshot and DOM scroll position.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns The installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
