/**
 * dsh-turn-filediff — generated Typert host manifest.
 *
 * Hand-authored strict invocation descriptors. The typert-loader requires each
 * strict codec to be backed by a real Zod v4 schema, so the codecs here are
 * Zod schemas.
 */
import { z } from "zod";

/** Shared result: whether the editor handoff was accepted. */
const openedResultSchema = z.object({
  opened: z.boolean().readonly(),
}).readonly();

/** `openFile` request: `{ path, line? }`. */
const openFileRequestSchema = z.object({
  path: z.string().readonly(),
  line: z.number().readonly().optional(),
}).readonly();

/** One applied hunk: `{ oldText: string | null, newText: string }`. */
const fileDiffSchema = z.object({
  oldText: z.string().nullable().readonly(),
  newText: z.string().readonly(),
}).readonly();

/**
 * `openDiff` request: `{ path, diffs }` — the ordered hunks for one file.
 * The legacy `{ path, oldText, newText }` single-snapshot shape is still
 * accepted so old persisted summaries keep working during rollout.
 */
const openDiffRequestSchema = z.object({
  path: z.string().readonly(),
  diffs: z.array(fileDiffSchema).readonly().optional(),
  oldText: z.string().readonly().optional(),
  newText: z.string().readonly().optional(),
}).readonly().refine(
  (value) =>
    (value.diffs !== undefined && value.diffs.length > 0) ||
    (typeof value.oldText === "string" && typeof value.newText === "string"),
  { message: "expected a non-empty diffs array or oldText/newText" },
);

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
            schema: openFileRequestSchema,
          },
        },
      ],
      result: {
        mode: "strict",
        typeSymbol: "OpenedResult",
        schema: openedResultSchema,
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
            schema: openDiffRequestSchema,
          },
        },
      ],
      result: {
        mode: "strict",
        typeSymbol: "OpenedResult",
        schema: openedResultSchema,
      },
      sourceLocation: { file: "lib/index.js", line: 1, column: 1 },
    },
  ],
  model: { services: [], events: [], objects: [] },
};

export default TYPERT;
