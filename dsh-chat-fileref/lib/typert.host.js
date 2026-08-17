/**
 * dsh-chat-fileref — generated Typert host manifest.
 *
 * Hand-authored strict invocation descriptors. The typert-loader requires each
 * strict codec to be backed by a real Zod v4 schema (it checks for the `_zod`
 * marker and a `parse` method), so the codecs here are Zod schemas.
 */
import { z } from "zod";

/** The `openFile` request object `{ path, line? }`. */
const openFileRequestSchema = z.object({
  path: z.string().readonly(),
  line: z.number().readonly().optional(),
}).readonly();

/** The `openFile` result object `{ opened: boolean }`. */
const openFileResultSchema = z.object({
  opened: z.boolean().readonly(),
}).readonly();

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
            schema: openFileRequestSchema,
          },
        },
      ],
      result: {
        mode: "strict",
        typeSymbol: "OpenFileResult",
        schema: openFileResultSchema,
      },
      sourceLocation: { file: "lib/index.js", line: 1, column: 1 },
    },
  ],
  model: { services: [], events: [], objects: [] },
};

export default TYPERT;
