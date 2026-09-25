/**
 * Tests for the popover-slot rules.
 *
 * These are the rules that keep 效果 / 多轨 / 对比 from stacking on top of each other,
 * and they are pure functions precisely so they can be checked here: the store itself is
 * a singleton wired to a live engine client, and the bug this replaced ("opening 多轨
 * leaves 效果 up as well") would not have shown up in any test of the individual panels.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { nextPanel, panelChanged, panelFromPersisted, PANEL_NAMES } from './openPanel.ts';

test('clicking a closed panel opens it', () => {
  assert.equal(nextPanel(null, 'effects'), 'effects');
  assert.equal(nextPanel(null, 'mixer'), 'mixer');
  assert.equal(nextPanel(null, 'compare'), 'compare');
});

test('clicking the open panel closes it, which is what makes the button a toggle', () => {
  assert.equal(nextPanel('effects', 'effects'), null);
  assert.equal(nextPanel('mixer', 'mixer'), null);
  assert.equal(nextPanel('compare', 'compare'), null);
});

test('clicking a different panel replaces the open one rather than adding to it', () => {
  // The reported class of bug: two popovers in one slot overlap into an unusable stack.
  for (const current of PANEL_NAMES) {
    for (const clicked of PANEL_NAMES) {
      if (current === clicked) continue;
      const next = nextPanel(current, clicked);
      assert.equal(next, clicked, `from ${current} clicking ${clicked} must leave only ${clicked}`);
      assert.notEqual(next, current, `from ${current} clicking ${clicked} must not keep ${current}`);
    }
  }
});

test('the toggle can never produce two open panels', () => {
  // Every reachable state is zero or one panel — never a pair. Walking the full graph is
  // what proves it for all six transitions at once.
  for (const from of [null, ...PANEL_NAMES]) {
    for (const clicked of PANEL_NAMES) {
      const next = nextPanel(from, clicked);
      assert.equal(typeof next === 'string' || next === null, true);
      assert.equal(next === null || PANEL_NAMES.includes(next), true);
    }
  }
});

test('panelChanged distinguishes a real change from a repeat', () => {
  assert.equal(panelChanged('effects', 'effects'), false);
  assert.equal(panelChanged(null, null), false);
  assert.equal(panelChanged('effects', null), true);
  assert.equal(panelChanged(null, 'mixer'), true);
  assert.equal(panelChanged('mixer', 'compare'), true);
});

test('panelFromPersisted restores a valid choice', () => {
  assert.equal(panelFromPersisted('effects'), 'effects');
  assert.equal(panelFromPersisted('mixer'), 'mixer');
  assert.equal(panelFromPersisted('compare'), 'compare');
});

test('panelFromPersisted treats anything else as "nothing open"', () => {
  // A value written by an older build, or hand-edited, must not leave the UI showing a
  // panel with no button to close it.
  assert.equal(panelFromPersisted(null), null);
  assert.equal(panelFromPersisted(undefined), null);
  assert.equal(panelFromPersisted(''), null);
  assert.equal(panelFromPersisted('Effects'), null);
  assert.equal(panelFromPersisted('true'), null);
  assert.equal(panelFromPersisted('{"open":"mixer"}'), null);
});
