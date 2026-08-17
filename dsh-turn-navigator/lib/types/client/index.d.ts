/** Browser entry: register the standalone turn navigator in the chat-owned rail slot. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type TurnNavigatorKey } from './locales.ts';
export type { TurnNavigatorKey } from './locales.ts';
/** Required services: the chat slot registry and localized preview copy. */
export declare const inject: string[];
/**
 * Register dictionaries and the turn rail after the chat view declares its
 * navigator slot.
 * @param ctx - Client root context.
 */
export declare function apply(ctx: ClientContext): void;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The turn navigator's accessible labels and preview chrome. */
        turnNavigator: TurnNavigatorKey;
    }
}
//# sourceMappingURL=index.d.ts.map
