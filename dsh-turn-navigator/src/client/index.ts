/** Browser entry: register the standalone turn navigator in the chat-owned rail slot. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { en, zh, type TurnNavigatorKey } from './locales.ts'
import { TurnNavigator } from './TurnNavigator.tsx'

export type { TurnNavigatorKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'turnNavigator'

/** Required services: the chat slot registry and localized preview copy. */
export const inject = ['slots', 'locale']

/**
 * Register dictionaries and the turn rail after the chat view declares its
 * navigator slot.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-turn-navigator: dictionaries')
  ctx.slots.inject('conversation.chat.navigator', () => ctx.slots.register(
    { name: 'conversation.chat.navigator', locale: NS },
    TurnNavigator,
  ))
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The turn navigator's accessible labels and preview chrome. */
    turnNavigator: TurnNavigatorKey
  }
}
