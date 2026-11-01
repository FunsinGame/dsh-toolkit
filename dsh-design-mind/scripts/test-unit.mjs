/** Pure-module tests: geometry, store rules, feedback validation, prompt. */

import assert from 'node:assert/strict'

import {
  DesignMindStore,
  HANDLES,
  InputError,
  applyMove,
  applyResize,
  buildFeedback,
  buildPrompt,
  clampScale,
  fitView,
  handleAt,
  handlePoints,
  normalizeComments,
  normalizeRect,
  rectToScreen,
  sameRect,
  toImagePoint,
  zoomAt,
} from '../lib/testable.js'

// ── geometry ────────────────────────────────────────────────────────────────
const fitted = fitView({ width: 1600, height: 900 }, { width: 1000, height: 700 })
assert.ok(Math.abs(fitted.scale - 936 / 1600) < 1e-9, 'fit scales to the padded width')
assert.ok(Math.abs(fitted.x - 32) < 1e-9, 'fit centres horizontally')
assert.ok(Math.abs(fitted.y - 86.75) < 1e-9, 'fit centres vertically')

const zoomed = zoomAt({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 100 })
assert.deepEqual(zoomed, { scale: 2, x: -100, y: -100 }, 'zoom keeps the anchor fixed')

const point = toImagePoint(150, 250, 50, 50, { scale: 2, x: 10, y: 20 })
assert.deepEqual(point, { x: 45, y: 90 }, 'pointer maps through the view transform')

assert.deepEqual(
  rectToScreen({ x1: 10, y1: 20, x2: 110, y2: 70 }, { scale: 2, x: 5, y: 7 }),
  { left: 25, top: 47, width: 200, height: 100 },
  'rect maps to screen',
)

assert.deepEqual(normalizeRect({ x: 10, y: 20 }, { x: 60, y: 80 }, { width: 320, height: 200 }), {
  x1: 10,
  y1: 20,
  x2: 60,
  y2: 80,
})
assert.equal(normalizeRect({ x: 300, y: 10 }, { x: 400, y: 60 }, { width: 320, height: 200 })?.x2, 320)
assert.equal(normalizeRect({ x: 10, y: 10 }, { x: 13, y: 40 }, { width: 320, height: 200 }), null, 'too narrow')
assert.equal(normalizeRect({ x: 10, y: 10 }, { x: 60, y: 12 }, { width: 320, height: 200 }), null, 'too short')
assert.equal(clampScale(100), 8)
assert.equal(clampScale(0.0001), 0.05)

// Six handles: four corners plus the left/right midpoints.
const handles = handlePoints({ x1: 10, y1: 20, x2: 110, y2: 70 })
assert.equal(HANDLES.length, 6)
assert.deepEqual(
  handles.map((entry) => entry.handle),
  ['nw', 'ne', 'w', 'e', 'sw', 'se'],
)
assert.deepEqual(handles[2].point, { x: 10, y: 45 }, 'west handle sits on the middle of the left edge')
assert.deepEqual(handles[3].point, { x: 110, y: 45 }, 'east handle sits on the middle of the right edge')
assert.equal(handleAt({ x1: 10, y1: 20, x2: 110, y2: 70 }, { x: 108, y: 68 }, 4), 'se')
assert.equal(handleAt({ x1: 10, y1: 20, x2: 110, y2: 70 }, { x: 60, y: 45 }, 4), null)

const moved = applyMove({ x1: 10, y1: 20, x2: 110, y2: 70 }, { x: 250, y: 5 }, { width: 320, height: 200 })
assert.deepEqual(moved, { x1: 220, y1: 25, x2: 320, y2: 75 }, 'move keeps the size and clamps to the image')

assert.deepEqual(
  applyResize({ x1: 10, y1: 20, x2: 110, y2: 70 }, 'se', { x: 160, y: 120 }, { width: 320, height: 200 }),
  { x1: 10, y1: 20, x2: 160, y2: 120 },
  'south-east handle moves both edges',
)
assert.deepEqual(
  applyResize({ x1: 10, y1: 20, x2: 110, y2: 70 }, 'w', { x: 60, y: 40 }, { width: 320, height: 200 }),
  { x1: 60, y1: 20, x2: 110, y2: 70 },
  'west handle only moves the left edge',
)
assert.deepEqual(
  applyResize({ x1: 10, y1: 20, x2: 110, y2: 70 }, 'nw', { x: -50, y: -50 }, { width: 320, height: 200 }),
  { x1: 0, y1: 0, x2: 110, y2: 70 },
  'resize clamps to the image origin',
)
assert.deepEqual(
  applyResize({ x1: 10, y1: 20, x2: 110, y2: 70 }, 'e', { x: 12, y: 40 }, { width: 320, height: 200 }),
  { x1: 10, y1: 20, x2: 14, y2: 70 },
  'the minimum size wins over a collapsing drag',
)
assert.equal(sameRect({ x1: 1, y1: 2, x2: 3, y2: 4 }, { x1: 1, y1: 2, x2: 3, y2: 4 }), true)
assert.equal(sameRect({ x1: 1, y1: 2, x2: 3, y2: 4 }, { x1: 1, y1: 2, x2: 3, y2: 5 }), false)

// ── store ──────────────────────────────────────────────────────────────────
const store = new DesignMindStore()
store.setImage({ blob: new Blob([]), url: 'blob:test', width: 320, height: 200, mime: 'image/png', name: 'design.png' })
const regionId = store.addRegion({ x1: 10, y1: 20, x2: 110, y2: 70 })
assert.equal(regionId, 'r1')
assert.equal(store.getSnapshot().selectedId, 'r1')
assert.equal(store.getSnapshot().justAdded, 'r1')
assert.equal(store.getSnapshot().needsFit, true, 'a new image requests a fit')

let region = store.getSnapshot().annotations[0]
assert.deepEqual(region.source, { x1: 10, y1: 20, x2: 110, y2: 70 }, 'a new region is its own source')
assert.equal(region.cut, false)

// Without a cut, the frame is just a selection: moving it moves the source too.
store.setRegionRect(regionId, { x1: 20, y1: 30, x2: 120, y2: 80 })
region = store.getSnapshot().annotations[0]
assert.deepEqual(region.source, { x1: 20, y1: 30, x2: 120, y2: 80 })
assert.deepEqual(region.rect, { x1: 20, y1: 30, x2: 120, y2: 80 })

store.cutRegion(regionId)
region = store.getSnapshot().annotations[0]
assert.equal(region.cut, true)
assert.deepEqual(region.source, { x1: 20, y1: 30, x2: 120, y2: 80 }, 'cutting pins the source')

// After a cut, moving only changes where the content is drawn.
store.setRegionRect(regionId, { x1: 60, y1: 50, x2: 160, y2: 100 })
region = store.getSnapshot().annotations[0]
assert.deepEqual(region.source, { x1: 20, y1: 30, x2: 120, y2: 80 })
assert.deepEqual(region.rect, { x1: 60, y1: 50, x2: 160, y2: 100 })

store.setText(regionId, '把按钮改成主色')
assert.equal(store.getSnapshot().annotations[0].text, '把按钮改成主色')
assert.equal(store.getSnapshot().justAdded, null, 'typing clears the autofocus marker')

const globalId = store.addGlobal()
assert.equal(globalId, 'g2')
store.setText(globalId, '整体留白再大一点')
assert.equal(store.getSnapshot().annotations.length, 2)

store.exportReady({ dir: 'C:/x', imagePath: 'C:/x/design.png', jsonPath: 'C:/x/feedback.json', prompt: 'P' })
assert.equal(store.getSnapshot().exportState.status, 'ready')
store.setText(regionId, '改一下')
assert.equal(store.getSnapshot().exportState.stale, true, 'editing after export marks it stale')
assert.equal(store.getSnapshot().exportState.prompt, 'P', 'the old prompt stays available')

store.remove(regionId)
assert.equal(store.getSnapshot().annotations.length, 1)
assert.equal(store.getSnapshot().selectedId, 'g2', 'removing another card keeps the selection')
store.remove(globalId)
assert.equal(store.getSnapshot().selectedId, null, 'removing the selected card clears the selection')

store.exportStart()
assert.equal(store.getSnapshot().exportState.status, 'running')
assert.equal(store.getSnapshot().exportState.prompt, '')

// ── feedback validation ────────────────────────────────────────────────────
const comments = normalizeComments(
  [
    { kind: 'region', source: { x1: 10, y1: 10, x2: 100, y2: 60 }, text: '  改成红色  ' },
    {
      kind: 'region',
      source: { x1: 10, y1: 110, x2: 100, y2: 160 },
      rect: { x1: 130, y1: 110, x2: 220, y2: 160 },
      text: '把这块挪到右边',
    },
    { kind: 'global', text: '整体留白再大一点' },
  ],
  320,
  200,
)
assert.equal(comments.length, 3)
assert.equal(comments[0].text, '改成红色')
assert.deepEqual(comments[0].rect, comments[0].source, 'a comment without rect keeps its source')
assert.deepEqual(comments[1].source, { x1: 10, y1: 110, x2: 100, y2: 160 })
assert.deepEqual(comments[1].rect, { x1: 130, y1: 110, x2: 220, y2: 160 })
assert.deepEqual(comments[2], { kind: 'global', text: '整体留白再大一点' })

const rejects = (value, message) => {
  assert.throws(
    () => normalizeComments(value, 320, 200),
    (error) => error instanceof InputError && error.status === 400,
    message,
  )
}
rejects([], 'empty list')
rejects([{ kind: 'region', source: { x1: 1.5, y1: 10, x2: 100, y2: 60 }, text: 'x' }], 'fractional coordinate')
rejects([{ kind: 'region', source: { x1: 10, y1: 10, x2: 400, y2: 60 }, text: 'x' }], 'out of bounds')
rejects([{ kind: 'region', source: { x1: 10, y1: 10, x2: 12, y2: 60 }, text: 'x' }], 'too narrow')
rejects([{ kind: 'region', source: { x1: 10, y1: 10, x2: 100, y2: 60 }, text: '   ' }], 'empty text')
rejects([{ kind: 'global', source: { x1: 1, y1: 1, x2: 5, y2: 5 }, text: 'x' }], 'global with geometry')
rejects([{ kind: 'other', text: 'x' }], 'unknown kind')
rejects(
  [
    {
      kind: 'region',
      source: { x1: 10, y1: 10, x2: 100, y2: 60 },
      rect: { x1: 300, y1: 10, x2: 400, y2: 60 },
      text: 'x',
    },
  ],
  'destination out of bounds',
)
rejects(
  [
    {
      kind: 'region',
      source: { x1: 10, y1: 10, x2: 100, y2: 60 },
      rect: { x1: 10, y1: 10, x2: 11, y2: 20 },
      text: 'x',
    },
  ],
  'destination too small',
)

const feedback = buildFeedback({
  version: '0.1.0',
  image: { file: 'design.png', mimeType: 'image/png', width: 320, height: 200, sha256: 'a'.repeat(64) },
  comments,
  createdAt: '2026-10-31T12:00:00.000Z',
})
assert.equal(feedback.schemaVersion, 'design-mind-1')
assert.equal(feedback.annotationSpace, 'image-pixels')
assert.equal(feedback.objects.length, 3)
assert.deepEqual(feedback.objects[0], {
  id: 'o1',
  kind: 'region',
  source: { x1: 10, y1: 10, x2: 100, y2: 60 },
  annotations: [{ number: 1, text: '改成红色' }],
})
assert.deepEqual(feedback.objects[1], {
  id: 'o2',
  kind: 'region',
  source: { x1: 10, y1: 110, x2: 100, y2: 160 },
  movement: {
    rect: { x1: 130, y1: 110, x2: 220, y2: 160 },
    dx: 120,
    dy: 0,
  },
  annotations: [{ number: 2, text: '把这块挪到右边' }],
})
assert.deepEqual(feedback.objects[2], {
  id: 'o3',
  kind: 'global',
  annotations: [{ number: 3, text: '整体留白再大一点' }],
})
assert.equal(feedback.image.sha256, 'a'.repeat(64))

// A resized cut records both axis scales, and a frame that never moved stays compact.
const resized = normalizeComments(
  [
    {
      kind: 'region',
      source: { x1: 0, y1: 0, x2: 100, y2: 50 },
      rect: { x1: 0, y1: 0, x2: 50, y2: 25 },
      text: '缩小一半',
    },
  ],
  320,
  200,
)
const resizedFeedback = buildFeedback({
  version: '0.1.0',
  image: { file: 'design.png', mimeType: 'image/png', width: 320, height: 200, sha256: 'a'.repeat(64) },
  comments: resized,
  createdAt: '2026-10-31T12:00:00.000Z',
})
assert.deepEqual(resizedFeedback.objects[0].movement, {
  rect: { x1: 0, y1: 0, x2: 50, y2: 25 },
  dx: 0,
  dy: 0,
  scaleX: 0.5,
  scaleY: 0.5,
})

const prompt = buildPrompt({
  imagePath: 'C:/exports/1/design.png',
  jsonPath: 'C:/exports/1/feedback.json',
  comments,
})
assert.ok(prompt.includes('3 处修改'))
assert.ok(prompt.includes('其中 1 处为整体意见'))
assert.ok(prompt.includes('C:/exports/1/design.png'))
assert.ok(prompt.includes('C:/exports/1/feedback.json'))
assert.ok(prompt.includes('右下边界不含自身'))
assert.ok(prompt.includes('带 `movement` 的对象'), 'the prompt explains moved regions')

const stillPrompt = buildPrompt({
  imagePath: 'C:/a.png',
  jsonPath: 'C:/a.json',
  comments: [comments[0]],
})
assert.ok(!stillPrompt.includes('带 `movement` 的对象'), 'no movement note when nothing moved')

console.log('unit tests passed')
