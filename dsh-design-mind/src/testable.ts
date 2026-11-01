/**
 * Plain Node entry for the unit tests: no React, no DOM, no DSH.
 *
 * `build.mjs` bundles this to `lib/testable.js`; the plugin loader never loads
 * it, so it does not extend the plugin contract.
 */

export {
  applyMove,
  applyResize,
  clampScale,
  fitView,
  handleAt,
  handlePoints,
  inside,
  normalizeRect,
  rectFromPoints,
  rectToScreen,
  sameRect,
  toImagePoint,
  zoomAt,
  HANDLES,
  MIN_REGION_SIZE,
  type Handle,
} from './client/geometry.ts'
export { DesignMindStore } from './client/store.ts'
export { buildFeedback, buildPrompt, InputError, normalizeComments, FEEDBACK_SCHEMA } from './host/feedback.ts'
