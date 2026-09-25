/**
 * Couples the effect popover's open state to the audio-effects master bypass.
 *
 * The user asked for one control: open the effect window, shape the sound, press play
 * to hear it processed; close the window and the next play is the original file again.
 * That makes *panel visibility* the bypass — there is no second switch to keep in step,
 * and no way for the two to disagree about what the user is hearing.
 *
 * Kept as pure functions over a chain object so the rule is testable without a DOM, an
 * AudioContext or a player: this is exactly the kind of small invariant that silently
 * rots otherwise, and its failure mode is "the audio is not what the UI says".
 */

import type { EffectChain } from '@sounddesk/audio-effects';

/**
 * The chain to install for a given panel state.
 *
 * Returns `null` when no change is needed, so callers can skip a redundant
 * `setChain` — which matters because that call touches the live audio graph and can
 * retrigger automation.
 *
 * The result is a **deep** copy, not a spread. A shallow copy shares the nested slot
 * objects (`eq`, `distortion`, `reverb`, …) with the input, so a later
 * `next.distortion.drive = …` would mutate the caller's chain from a distance — the
 * exact class of aliasing bug this whole feature is meant to avoid, since the two
 * copies are the "panel is open" and "panel is closed" states of the same sound.
 */
export function chainForPanelState(chain: EffectChain, open: boolean): EffectChain | null {
  if (chain.enabled === open) return null;
  return { ...structuredClone(chain), enabled: open };
}

/**
 * Whether the chain actively colours the audio.
 *
 * `enabled` is the master bypass and `isNeutral` covers every slot being at its neutral
 * value; both must be considered, because a chain can be enabled *and* transparent.
 */
export function isProcessing(chain: EffectChain, isNeutral: (chain: EffectChain) => boolean): boolean {
  return chain.enabled && !isNeutral(chain);
}

/**
 * One-line description of what the user is currently hearing.
 *
 * The panel needs to say this because closing it is what bypasses the chain: if the
 * window is open but the sound is dry (every slot neutral, or the user hit bypass
 * inside), stating "已修改" would be a lie about the audio.
 */
export function hearingLabel(chain: EffectChain, isNeutral: (chain: EffectChain) => boolean): '原声' | '已修改' | '已旁通' {
  if (!chain.enabled) return '已旁通';
  return isNeutral(chain) ? '原声' : '已修改';
}
