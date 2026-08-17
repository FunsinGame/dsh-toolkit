import type { UserMessageNode } from '@deepseek-ai/dsh-client-runtime/client';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Minimum user-turn count at which navigation provides more value than noise. */
export declare const MIN_TURNS = 3;
/** One marker projected from a settled user message. */
export interface TurnMarker {
    readonly seq: number;
    readonly preview: string;
}
/** Full props supplied by the session-scoped navigator slot and locale seat. */
export type TurnNavigatorProps = PropsRuntime<'conversation.chat.navigator'> & PropsLocale<'turnNavigator'>;
/** Collapse the text blocks of one user message into a compact hover preview. */
export declare function messagePreview(content: UserMessageNode['content']): string;
/**
 * User-turn rows currently rendered inside the transcript, in flow order.
 * The chat flow anchors rows by their conversation Context key (kind+id),
 * which the snapshot's legacy node projection does not expose, so markers
 * pair with rows positionally: the i-th settled user turn renders the i-th
 * user row.
 */
export declare function userRows(scrollport: HTMLElement): HTMLElement[];
/** Resolve the rendered row for the marker at `index` among user turns. */
export declare function rowForTurn(scrollport: HTMLElement, index: number): HTMLElement | null;
/**
 * Resolve the turn crossing the reading line. The bottom position always
 * selects the newest turn, including a transcript shorter than its viewport.
 */
export declare function activeTurnSeq(scrollport: HTMLElement, turns: readonly TurnMarker[]): number | null;
/** Turn rail with hover/focus previews and direct scroll navigation. */
export declare function TurnNavigator({ useSession, loadOlder, t }: TurnNavigatorProps): import("react").JSX.Element | null;
//# sourceMappingURL=TurnNavigator.d.ts.map
