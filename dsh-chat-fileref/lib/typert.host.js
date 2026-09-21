/**
 * dsh-chat-fileref — Typert host manifest.
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

/** The `openFile` request object `{ path, line? }`. */
const openFileRequestSchema = schemaOf(() => z.object({
  path: z.string().readonly(),
  line: z.number().readonly().optional(),
}).readonly());

/** The `openFile` result object `{ opened: boolean }`. */
const openFileResultSchema = schemaOf(() => z.object({
  opened: z.boolean().readonly(),
}).readonly());

export const TYPERT = {
  package: "dsh-chat-fileref",
  face: "host",
  schemas: [],
  invocations: [
    {
      id: "dsh-chat-fileref#fileref/openFile",
      service: "fileref",
      namespace: "fileref",
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
        typeSymbol: "OpenFileResult",
        create: openFileResultSchema,
      },
      sourceLocation: { file: "lib/index.js", line: 1, column: 1 },
    },
  ],
  model: { services: [], events: [], objects: [] },
};

export default TYPERT;
