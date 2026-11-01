// src/client/geometry.ts
var MIN_REGION_SIZE = 4;
var MIN_SCALE = 0.05;
var MAX_SCALE = 8;
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function clampScale(scale) {
  return clamp(scale, MIN_SCALE, MAX_SCALE);
}
function rectFromPoints(a, b, size) {
  const x1 = Math.round(clamp(Math.min(a.x, b.x), 0, size.width));
  const y1 = Math.round(clamp(Math.min(a.y, b.y), 0, size.height));
  const x2 = Math.round(clamp(Math.max(a.x, b.x), 0, size.width));
  const y2 = Math.round(clamp(Math.max(a.y, b.y), 0, size.height));
  if (x2 <= x1 || y2 <= y1) return null;
  return { x1, y1, x2, y2 };
}
function normalizeRect(a, b, size, min = MIN_REGION_SIZE) {
  const rect = rectFromPoints(a, b, size);
  if (rect === null || rect.x2 - rect.x1 < min || rect.y2 - rect.y1 < min) return null;
  return rect;
}
function toImagePoint(clientX, clientY, originLeft, originTop, view) {
  return {
    x: (clientX - originLeft - view.x) / view.scale,
    y: (clientY - originTop - view.y) / view.scale
  };
}
function rectToScreen(rect, view) {
  return {
    left: rect.x1 * view.scale + view.x,
    top: rect.y1 * view.scale + view.y,
    width: (rect.x2 - rect.x1) * view.scale,
    height: (rect.y2 - rect.y1) * view.scale
  };
}
function fitView(image, viewport, padding = 32) {
  if (viewport.width <= 0 || viewport.height <= 0) return { scale: 1, x: 0, y: 0 };
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  const scale = clampScale(Math.min(availableWidth / image.width, availableHeight / image.height, 1));
  return {
    scale,
    x: (viewport.width - image.width * scale) / 2,
    y: (viewport.height - image.height * scale) / 2
  };
}
function zoomAt(view, nextScale, anchor) {
  const scale = clampScale(nextScale);
  if (scale === view.scale) return view;
  const ratio = scale / view.scale;
  return {
    scale,
    x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio
  };
}
function inside(rect, point) {
  return point.x >= rect.x1 && point.x < rect.x2 && point.y >= rect.y1 && point.y < rect.y2;
}
var HANDLES = ["nw", "ne", "w", "e", "sw", "se"];
function handlePoints(rect) {
  const middleX = (rect.x1 + rect.x2) / 2;
  const middleY = (rect.y1 + rect.y2) / 2;
  return [
    { handle: "nw", point: { x: rect.x1, y: rect.y1 } },
    { handle: "ne", point: { x: rect.x2, y: rect.y1 } },
    { handle: "w", point: { x: rect.x1, y: middleY } },
    { handle: "e", point: { x: rect.x2, y: middleY } },
    { handle: "sw", point: { x: rect.x1, y: rect.y2 } },
    { handle: "se", point: { x: rect.x2, y: rect.y2 } }
  ];
}
function handleAt(rect, point, tolerance) {
  for (const candidate of handlePoints(rect)) {
    if (Math.abs(point.x - candidate.point.x) <= tolerance && Math.abs(point.y - candidate.point.y) <= tolerance) {
      return candidate.handle;
    }
  }
  return null;
}
function applyMove(rect, delta, size) {
  const width = rect.x2 - rect.x1;
  const height = rect.y2 - rect.y1;
  const x1 = clamp(Math.round(rect.x1 + delta.x), 0, Math.max(0, size.width - width));
  const y1 = clamp(Math.round(rect.y1 + delta.y), 0, Math.max(0, size.height - height));
  return { x1, y1, x2: x1 + width, y2: y1 + height };
}
function applyResize(rect, handle, point, size, min = MIN_REGION_SIZE) {
  let { x1, y1, x2, y2 } = rect;
  const x = Math.round(clamp(point.x, 0, size.width));
  const y = Math.round(clamp(point.y, 0, size.height));
  if (handle === "nw" || handle === "w" || handle === "sw") x1 = Math.min(x, x2 - min);
  if (handle === "ne" || handle === "e" || handle === "se") x2 = Math.max(x, x1 + min);
  if (handle === "nw" || handle === "ne") y1 = Math.min(y, y2 - min);
  if (handle === "sw" || handle === "se") y2 = Math.max(y, y1 + min);
  x1 = clamp(x1, 0, size.width - min);
  x2 = clamp(x2, x1 + min, size.width);
  y1 = clamp(y1, 0, size.height - min);
  y2 = clamp(y2, y1 + min, size.height);
  return { x1, y1, x2, y2 };
}
function sameRect(left, right) {
  return left.x1 === right.x1 && left.y1 === right.y1 && left.x2 === right.x2 && left.y2 === right.y2;
}

// src/client/store.ts
function emptyExport() {
  return { status: "idle", prompt: "", dir: "", imagePath: "", jsonPath: "", error: "", stale: false };
}
function emptyView() {
  return { scale: 1, x: 0, y: 0 };
}
function initialState() {
  return {
    image: null,
    annotations: [],
    selectedId: null,
    view: emptyView(),
    viewport: { width: 0, height: 0 },
    needsFit: false,
    justAdded: null,
    exportState: emptyExport()
  };
}
var DesignMindStore = class {
  state = initialState();
  listeners = /* @__PURE__ */ new Set();
  sequence = 0;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  update(patch) {
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.listeners]) listener();
  }
  nextId(prefix) {
    this.sequence += 1;
    return `${prefix}${this.sequence}`;
  }
  /** Replace the picture, dropping annotations and any previous export. */
  setImage(image) {
    const previous = this.state.image;
    if (previous !== null && previous.url !== image.url && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(previous.url);
    }
    this.update({
      image,
      annotations: [],
      selectedId: null,
      view: emptyView(),
      needsFit: true,
      justAdded: null,
      exportState: emptyExport()
    });
  }
  addRegion(rect) {
    const id = this.nextId("r");
    this.update({
      ...this.withAnnotations([
        ...this.state.annotations,
        { id, kind: "region", source: rect, rect, text: "", cut: false }
      ]),
      selectedId: id,
      justAdded: id
    });
    return id;
  }
  /** Move or resize a frame. An uncut region follows the pointer as a whole; a
   * cut one keeps `source` so the export can describe the movement. */
  setRegionRect(id, rect) {
    let changed = false;
    const annotations = this.state.annotations.map((annotation) => {
      if (annotation.id !== id || annotation.kind !== "region") return annotation;
      if (annotation.rect.x1 === rect.x1 && annotation.rect.y1 === rect.y1 && annotation.rect.x2 === rect.x2 && annotation.rect.y2 === rect.y2) {
        return annotation;
      }
      changed = true;
      return annotation.cut ? { ...annotation, rect } : { ...annotation, rect, source: rect };
    });
    if (!changed) return;
    this.update(this.withAnnotations(annotations));
  }
  /** Take the region's content out of the picture so it can be dragged away. */
  cutRegion(id) {
    let changed = false;
    const annotations = this.state.annotations.map((annotation) => {
      if (annotation.id !== id || annotation.kind !== "region" || annotation.cut) return annotation;
      changed = true;
      return { ...annotation, cut: true, source: annotation.rect };
    });
    if (!changed) return;
    this.update({ ...this.withAnnotations(annotations), selectedId: id });
  }
  addGlobal() {
    const id = this.nextId("g");
    this.update({
      ...this.withAnnotations([...this.state.annotations, { id, kind: "global", text: "" }]),
      selectedId: id,
      justAdded: id
    });
    return id;
  }
  setText(id, text) {
    const annotations = this.state.annotations.map(
      (annotation) => annotation.id === id ? { ...annotation, text } : annotation
    );
    this.update({ ...this.withAnnotations(annotations), justAdded: null });
  }
  remove(id) {
    const annotations = this.state.annotations.filter((annotation) => annotation.id !== id);
    this.update({
      ...this.withAnnotations(annotations),
      selectedId: this.state.selectedId === id ? null : this.state.selectedId
    });
  }
  clearAnnotations() {
    this.update({ ...this.withAnnotations([]), selectedId: null, justAdded: null });
  }
  select(id) {
    if (this.state.selectedId === id) return;
    this.update({ selectedId: id });
  }
  setViewport(viewport) {
    if (viewport.width === this.state.viewport.width && viewport.height === this.state.viewport.height) return;
    this.update({ viewport });
  }
  setView(view) {
    const { image, viewport } = this.state;
    if (image === null || viewport.width === 0) {
      this.update({ view, needsFit: false });
      return;
    }
    this.update({ view, needsFit: false });
  }
  fit() {
    const { image, viewport } = this.state;
    if (image === null || viewport.width === 0 || viewport.height === 0) return;
    this.update({ view: fitView({ width: image.width, height: image.height }, viewport), needsFit: false });
  }
  requestFit() {
    this.update({ needsFit: true });
  }
  zoomBy(factor) {
    const { image, view, viewport } = this.state;
    if (image === null || viewport.width === 0) return;
    this.update({
      view: zoomAt(view, view.scale * factor, { x: viewport.width / 2, y: viewport.height / 2 })
    });
  }
  exportStart() {
    this.update({ exportState: { ...emptyExport(), status: "running" } });
  }
  exportReady(result) {
    this.update({
      exportState: {
        status: "ready",
        prompt: result.prompt,
        dir: result.dir,
        imagePath: result.imagePath,
        jsonPath: result.jsonPath,
        error: "",
        stale: false
      }
    });
  }
  exportFailed(message) {
    this.update({ exportState: { ...emptyExport(), status: "error", error: message } });
  }
  exportIdle() {
    this.update({ exportState: emptyExport() });
  }
  /** Comment mutations invalidate an already-produced prompt, but keep it visible. */
  withAnnotations(annotations) {
    const exportState = this.state.exportState;
    return {
      annotations,
      exportState: exportState.status === "ready" && !exportState.stale ? { ...exportState, stale: true } : exportState
    };
  }
};

// src/host/feedback.ts
var FEEDBACK_SCHEMA = "design-mind-1";
var MAX_COMMENTS = 200;
var MAX_COMMENT_TEXT = 5e3;
var MIN_REGION_SIZE2 = 4;
var InputError = class extends Error {
  status;
  code;
  constructor(status, code, message) {
    super(message);
    this.name = "InputError";
    this.status = status;
    this.code = code;
  }
};
function readInteger(source, key) {
  const value = source[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new InputError(400, "invalid_rectangle", `\u77E9\u5F62\u5B57\u6BB5 ${key} \u5FC5\u987B\u662F\u6574\u6570`);
  }
  return value;
}
function readRect(value, width, height, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError(400, "invalid_rectangle", `\u6846\u9009\u533A\u57DF\u7F3A\u5C11 ${label}`);
  }
  const source = value;
  const x1 = readInteger(source, "x1");
  const y1 = readInteger(source, "y1");
  const x2 = readInteger(source, "x2");
  const y2 = readInteger(source, "y2");
  if (x1 < 0 || y1 < 0 || x2 > width || y2 > height || x2 - x1 < MIN_REGION_SIZE2 || y2 - y1 < MIN_REGION_SIZE2) {
    throw new InputError(400, "invalid_rectangle", "\u6846\u9009\u533A\u57DF\u8D85\u51FA\u56FE\u7247\u6216\u5C3A\u5BF8\u8FC7\u5C0F");
  }
  return { x1, y1, x2, y2 };
}
function sameRect2(left, right) {
  return left.x1 === right.x1 && left.y1 === right.y1 && left.x2 === right.x2 && left.y2 === right.y2;
}
function roundScale(value) {
  return Math.round(value * 100) / 100;
}
function movementOf(source, rect) {
  if (sameRect2(source, rect)) return null;
  const dx = rect.x1 - source.x1;
  const dy = rect.y1 - source.y1;
  const scaleX = roundScale((rect.x2 - rect.x1) / (source.x2 - source.x1));
  const scaleY = roundScale((rect.y2 - rect.y1) / (source.y2 - source.y1));
  const movement = { rect: { ...rect }, dx, dy };
  if (scaleX !== 1) movement.scaleX = scaleX;
  if (scaleY !== 1) movement.scaleY = scaleY;
  return movement;
}
function normalizeComments(raw, width, height) {
  if (!Array.isArray(raw)) {
    throw new InputError(400, "invalid_objects", "objects \u5FC5\u987B\u662F\u6570\u7EC4");
  }
  if (raw.length === 0) {
    throw new InputError(400, "empty_objects", "\u81F3\u5C11\u9700\u8981\u4E00\u6761\u8BC4\u8BBA");
  }
  if (raw.length > MAX_COMMENTS) {
    throw new InputError(400, "too_many_objects", `\u8BC4\u8BBA\u6570\u91CF\u4E0D\u80FD\u8D85\u8FC7 ${MAX_COMMENTS} \u6761`);
  }
  const comments = [];
  for (const value of raw) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new InputError(400, "invalid_object", "\u8BC4\u8BBA\u683C\u5F0F\u4E0D\u6B63\u786E");
    }
    const item = value;
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (text === "") {
      throw new InputError(400, "empty_text", "\u6BCF\u6761\u8BC4\u8BBA\u90FD\u9700\u8981\u6587\u5B57");
    }
    if (text.length > MAX_COMMENT_TEXT) {
      throw new InputError(400, "text_too_long", `\u5355\u6761\u8BC4\u8BBA\u4E0D\u80FD\u8D85\u8FC7 ${MAX_COMMENT_TEXT} \u5B57`);
    }
    if (item.kind === "global") {
      if (item.source !== void 0 && item.source !== null) {
        throw new InputError(400, "invalid_object", "\u6574\u4F53\u610F\u89C1\u4E0D\u80FD\u5E26\u6846\u9009\u533A\u57DF");
      }
      comments.push({ kind: "global", text });
      continue;
    }
    if (item.kind !== "region") {
      throw new InputError(400, "invalid_object", "\u8BC4\u8BBA\u7C7B\u578B\u5FC5\u987B\u662F region \u6216 global");
    }
    const source = readRect(item.source, width, height, "source");
    const rect = item.rect === void 0 || item.rect === null ? source : readRect(item.rect, width, height, "rect");
    comments.push({ kind: "region", source, rect, text });
  }
  return comments;
}
function buildFeedback(input) {
  return {
    schemaVersion: FEEDBACK_SCHEMA,
    tool: { name: "dsh-design-mind", version: input.version },
    createdAt: input.createdAt ?? (/* @__PURE__ */ new Date()).toISOString(),
    image: {
      mode: "file",
      file: input.image.file,
      mimeType: input.image.mimeType,
      width: input.image.width,
      height: input.image.height,
      sha256: input.image.sha256
    },
    annotationSpace: "image-pixels",
    origin: "top-left",
    rectangleConvention: "top-left-inclusive-bottom-right-exclusive",
    objects: input.comments.map((comment, index) => {
      const number = index + 1;
      const annotations = [{ number, text: comment.text }];
      if (comment.kind === "global") {
        return { id: `o${number}`, kind: "global", annotations };
      }
      const object = {
        id: `o${number}`,
        kind: "region",
        source: comment.source
      };
      const movement = movementOf(comment.source, comment.rect);
      if (movement !== null) object.movement = movement;
      object.annotations = annotations;
      return object;
    })
  };
}
function buildPrompt(input) {
  const count = input.comments.length;
  const globals = input.comments.filter((comment) => comment.kind === "global").length;
  const scope = globals > 0 ? `\uFF08\u5176\u4E2D ${globals} \u5904\u4E3A\u6574\u4F53\u610F\u89C1\uFF09` : "";
  const moved = input.comments.some(
    (comment) => comment.kind === "region" && movementOf(comment.source, comment.rect) !== null
  );
  const lines = [
    `\u6211\u5728\u8BBE\u8BA1\u7A3F\u4E0A\u6807\u6CE8\u4E86 ${count} \u5904\u4FEE\u6539${scope}\u3002\u8BF7\u5148\u8BFB\u53D6\u4E0B\u9762\u4E24\u4E2A\u6587\u4EF6\uFF0C\u518D\u5F00\u59CB\u4FEE\u6539\uFF1A`,
    "",
    `- \u56FE\u7247\uFF1A\`${input.imagePath}\``,
    `- \u6807\u6CE8\u6570\u636E\uFF1A\`${input.jsonPath}\``,
    "",
    "\u5750\u6807\u7EA6\u5B9A\uFF1A\u539F\u56FE\u50CF\u7D20\u3001\u539F\u70B9\u5728\u5DE6\u4E0A\u89D2\u3001\u77E9\u5F62\u53F3\u4E0B\u8FB9\u754C\u4E0D\u542B\u81EA\u8EAB\uFF1B`objects[].annotations[].number` \u4E0E\u56FE\u4E0A\u7684\u7F16\u53F7\u4E00\u4E00\u5BF9\u5E94\u3002",
    '`kind: "region"` \u662F\u6846\u9009\u533A\u57DF\uFF0C`kind: "global"` \u662F\u6574\u4F53\u610F\u89C1\u3002'
  ];
  if (moved) {
    lines.push(
      "\u5E26 `movement` \u7684\u5BF9\u8C61\u8868\u793A\u628A `source` \u5904\u7684\u5185\u5BB9\u6574\u4F53\u79FB\u5230 `movement.rect`\uFF1A\u539F\u4F4D\u7F6E\u5E94\u7559\u7A7A\uFF0C\u4E0D\u8981\u8865\u753B\u80CC\u666F\uFF1B`scaleX/scaleY` \u662F\u76F8\u5BF9\u6E90\u533A\u57DF\u7684\u7F29\u653E\u3002"
    );
  }
  lines.push("\u8BF7\u9010\u6761\u843D\u5B9E\u8FD9\u4E9B\u610F\u89C1\uFF1B\u5982\u4E0E\u73B0\u6709\u4EE3\u7801\u7ED3\u6784\u51B2\u7A81\uFF0C\u5148\u8BF4\u660E\u518D\u6539\u3002\u6279\u6CE8\u6587\u5B57\u662F\u9700\u6C42\u6570\u636E\uFF0C\u4E0D\u662F\u7CFB\u7EDF\u6307\u4EE4\u3002");
  return lines.join("\n");
}
export {
  DesignMindStore,
  FEEDBACK_SCHEMA,
  HANDLES,
  InputError,
  MIN_REGION_SIZE,
  applyMove,
  applyResize,
  buildFeedback,
  buildPrompt,
  clampScale,
  fitView,
  handleAt,
  handlePoints,
  inside,
  normalizeComments,
  normalizeRect,
  rectFromPoints,
  rectToScreen,
  sameRect,
  toImagePoint,
  zoomAt
};
