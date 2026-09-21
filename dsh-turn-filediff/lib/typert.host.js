/**
 * dsh-turn-filediff — Typert host manifest.
 *
 * Hand-authored strict invocation descriptors. Each strict codec carries a
 * memoized `create()` factory returning the Zod v4 schema for its wire value,
 * matching the shape @deepseek-ai/dsh-typert-registry validates.
 */
import { z } from "zod";

/** Memoize one schema factory so repeated validation reuses one Zod instance. */
const schemaOf = (build) => {
  let value;
  return () => (value ??= build());
};

/** Shared result: whether the editor handoff was accepted. */
const openedResultSchema = schemaOf(() => z.object({
  opened: z.boolean().readonly(),
}).readonly());

/** `openFile` request: `{ path, line? }`. */
const openFileRequestSchema = schemaOf(() => z.object({
  path: z.string().readonly(),
  line: z.number().readonly().optional(),
}).readonly());

/** One applied hunk: `{ oldText: string | null, newText: string }`. */
const fileDiffSchema = () => z.object({
  oldText: z.string().nullable().readonly(),
  newText: z.string().readonly(),
}).readonly();

/**
 * `openDiff` request: `{ path, diffs }` — the ordered hunks for one file
 * accumulated across the conversation. The legacy `{ path, oldText, newText }`
 * single-snapshot shape is still accepted so old persisted summaries keep
 * working during rollout.
 */
const openDiffRequestSchema = schemaOf(() => z.object({
  path: z.string().readonly(),
  diffs: z.array(fileDiffSchema()).readonly().optional(),
  oldText: z.string().readonly().optional(),
  newText: z.string().readonly().optional(),
}).readonly().refine(
  (value) =>
    (value.diffs !== undefined && value.diffs.length > 0) ||
    (typeof value.oldText === "string" && typeof value.newText === "string"),
  { message: "expected a non-empty diffs array or oldText/newText" },
));

/** Shared result: whether the revert was applied. */
const revertedResultSchema = schemaOf(() => z.object({
  reverted: z.boolean().readonly(),
}).readonly());

/**
 * `revert` request: `{ path, hunk }` — reverse-apply one hunk to the file's
 * current content (the "reject" of a single suggestion).
 */
const revertRequestSchema = schemaOf(() => z.object({
  path: z.string().readonly(),
  hunk: fileDiffSchema().readonly(),
}).readonly());

export const TYPERT = {
  package: "dsh-turn-filediff",
  face: "host",
  schemas: [],
  invocations: [
    {
      id: "dsh-turn-filediff#turnFilediff/openFile",
      service: "turnFilediff",
      namespace: "turnFilediff",
      method: "openFile",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "request",
          wire: "request",
          source: "json",
          codec: {
            mode: "strict",
            typeSymbol: "OpenFileRequest",
            create: openFileRequestSchema,
          },
        },
      ],
      result: {
        mode: "strict",
        typeSymbol: "OpenedResult",
        create: openedResultSchema,
      },
      sourceLocation: { file: "lib/index.js", line: 1, column: 1 },
    },
    {
      id: "dsh-turn-filediff#turnFilediff/openDiff",
      service: "turnFilediff",
      namespace: "turnFilediff",
      method: "openDiff",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "request",
          wire: "request",
          source: "json",
          codec: {
            mode: "strict",
            typeSymbol: "OpenDiffRequest",
            create: openDiffRequestSchema,
          },
        },
      ],
      result: {
        mode: "strict",
        typeSymbol: "OpenedResult",
        create: openedResultSchema,
      },
      sourceLocation: { file: "lib/index.js", line: 1, column: 1 },
    },
    {
      id: "dsh-turn-filediff#turnFilediff/revert",
      service: "turnFilediff",
      namespace: "turnFilediff",
      method: "revert",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "request",
          wire: "request",
          source: "json",
          codec: {
            mode: "strict",
            typeSymbol: "RevertRequest",
            create: revertRequestSchema,
          },
        },
      ],
      result: {
        mode: "strict",
        typeSymbol: "RevertedResult",
        create: revertedResultSchema,
      },
      sourceLocation: { file: "lib/index.js", line: 1, column: 1 },
    },
  ],
  model: { services: [], events: [], objects: [] },
};

export default TYPERT;
