/**
 * Tests for the panel-open ↔ master-bypass coupling.
 *
 * The behaviour under test is a promise made to the user in the UI: with the effect
 * window open, play is processed; with it closed, play is the original file. Both halves
 * are easy to break invisibly — the audio would simply not match what the panel says —
 * so they are pinned here rather than left to manual listening.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_EFFECT_CHAIN, isNeutral, type EffectChain } from '@sounddesk/audio-effects';

import { chainForPanelState, hearingLabel, isProcessing } from './effectPanel.ts';

/** A chain that definitely colours the audio: distortion fully engaged. */
function processed(): EffectChain {
  const chain = structuredClone(DEFAULT_EFFECT_CHAIN);
  chain.distortion = { ...chain.distortion, enabled: true, drive: 0.8, mix: 1 };
  return chain;
}

/** A chain that is enabled but transparent — every slot at its neutral value. */
function neutralEnabled(): EffectChain {
  return { ...structuredClone(DEFAULT_EFFECT_CHAIN), enabled: true };
}

test('opening the panel enables a bypassed chain', () => {
  const bypassed = { ...processed(), enabled: false };
  const next = chainForPanelState(bypassed, true);
  assert.ok(next, 'a change is required');
  assert.equal(next.enabled, true);
  // The settings must survive: turning the panel on is not the same as resetting it.
  assert.equal(next.distortion.drive, 0.8);
  assert.equal(next.distortion.mix, 1);
});

test('closing the panel bypasses the chain but keeps every setting', () => {
  const next = chainForPanelState(processed(), false);
  assert.ok(next);
  assert.equal(next.enabled, false, 'closing must return the user to the original audio');
  // This is the whole reason for using the master bypass rather than clearing the chain:
  // reopening must restore the work, not lose it.
  assert.equal(next.distortion.enabled, true);
  assert.equal(next.distortion.drive, 0.8);
  assert.deepEqual(next.eq, processed().eq);
});

test('a chain already in the wanted state is left alone', () => {
  // Returning null lets the caller skip `setChain`, which touches the live audio graph.
  assert.equal(chainForPanelState(processed(), true), null);
  assert.equal(chainForPanelState({ ...processed(), enabled: false }, false), null);
});

test('the returned chain is a copy, so the caller cannot mutate the original', () => {
  const original = processed();
  const next = chainForPanelState(original, false);
  assert.ok(next);
  next.distortion.drive = 0.1;
  assert.equal(original.distortion.drive, 0.8, 'the input chain must not be mutated in place');
});

test('a neutral but enabled chain does not count as processing', () => {
  // Both halves matter: an enabled chain whose slots are all neutral is still the
  // original audio, and claiming otherwise would misreport what is being heard.
  assert.equal(isProcessing(processed(), isNeutral), true);
  assert.equal(isProcessing(neutralEnabled(), isNeutral), false);
  assert.equal(isProcessing({ ...processed(), enabled: false }, isNeutral), false);
});

test('the header label distinguishes bypassed from transparent from processed', () => {
  // Three genuinely different states, and the panel is the only place the user can read
  // which one they are in — because closing the panel is what bypasses the chain.
  assert.equal(hearingLabel(processed(), isNeutral), '已修改');
  assert.equal(hearingLabel(neutralEnabled(), isNeutral), '原声');
  assert.equal(hearingLabel({ ...processed(), enabled: false }, isNeutral), '已旁通');
});

test('the default chain starts enabled, so the panel and the audio agree on first open', () => {
  // If the default were bypassed, opening the panel onto a fresh install would show
  // controls that do nothing until the user found the in-panel bypass button.
  assert.equal(DEFAULT_EFFECT_CHAIN.enabled, true);
  assert.equal(isNeutral(DEFAULT_EFFECT_CHAIN), true, 'and it is transparent until told otherwise');
  assert.equal(chainForPanelState(DEFAULT_EFFECT_CHAIN, true), null);
});

test('open/close/reopen round-trips to exactly the chain the user built', () => {
  // The user-visible promise: tweak, close, hear the original, reopen, keep tweaking.
  const built = processed();
  const closed = chainForPanelState(built, false);
  assert.ok(closed);
  const reopened = chainForPanelState(closed, true);
  assert.ok(reopened);
  assert.deepEqual(reopened, built, 'reopening must restore the chain exactly');
});
