/**
 * dsh-scoped-mcp Typert host manifest.
 *
 * Strict invocation descriptors for the `scopedMcpManager` remote service.
 * The host service implementation lives in ./mcp-service.js. Each strict codec
 * carries a memoized `create()` factory returning its Zod v4 schema, matching
 * the shape @deepseek-ai/dsh-typert-registry validates.
 */
import { z } from "zod";

/** Memoize one schema factory so repeated validation reuses one Zod instance. */
const schemaOf = (build) => {
  let value;
  return () => (value ??= build());
};

const serverSchema = schemaOf(() => z.object({
  serverName: z.string(),
  transport: z.enum(["stdio", "streamable-http"]),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
  url: z.string().optional(),
  headers: z.record(z.string()).optional(),
  toolCallTimeoutMs: z.number().optional(),
  failOnStartupError: z.boolean().optional(),
  reconnect: z.object({
    enabled: z.boolean().optional(),
    initialDelayMs: z.number().optional(),
    maxDelayMs: z.number().optional(),
    maxAttempts: z.number().optional(),
  }).optional(),
  disabled: z.boolean().optional(),
}).passthrough());

const serverViewSchema = schemaOf(() => serverSchema().extend({
  scope: z.string().optional(),
}).passthrough());

const scopeViewSchema = schemaOf(() => z.object({
  kind: z.enum(["global", "workspace"]),
  path: z.string().nullable().optional(),
  label: z.string().optional(),
  servers: z.array(serverViewSchema()).default([]),
}).passthrough());

const listResultSchema = schemaOf(() => z.object({
  global: scopeViewSchema(),
  workspace: scopeViewSchema().nullable().optional(),
  currentCwd: z.string().nullable().optional(),
}).passthrough());

const savePayloadSchema = schemaOf(() => z.object({
  sessionId: z.string().optional(),
  scope: z.string(),
  server: serverSchema(),
  previousServerName: z.string().optional(),
}).passthrough());

const removePayloadSchema = schemaOf(() => z.object({
  sessionId: z.string().optional(),
  scope: z.string(),
  serverName: z.string(),
}).passthrough());

const setEnabledPayloadSchema = schemaOf(() => z.object({
  sessionId: z.string().optional(),
  scope: z.string(),
  serverName: z.string(),
  enabled: z.boolean(),
}).passthrough());

const testPayloadSchema = schemaOf(() => z.object({
  sessionId: z.string().optional(),
  scope: z.string().optional(),
  serverName: z.string().optional(),
  server: serverSchema().optional(),
}).passthrough());

const testResultSchema = schemaOf(() => z.object({
  ok: z.boolean(),
  tools: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
  })).default([]),
  error: z.string().optional(),
}).passthrough());

const mutationResultSchema = schemaOf(() => z.object({
  ok: z.boolean(),
  scope: z.string(),
  servers: z.array(serverViewSchema()).default([]),
  error: z.string().optional(),
}).passthrough());

export const TYPERT = {
  package: "dsh-scoped-mcp",
  face: "host",
  schemas: [],
  invocations: [
    {
      id: "dsh-scoped-mcp#scopedMcpManager/list",
      service: "scopedMcpManager",
      namespace: "scopedMcpManager",
      method: "list",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "sessionId",
          wire: "sessionId",
          source: "json",
          acceptsUndefined: true,
          codec: { mode: "strict", typeSymbol: "SessionId", create: () => z.string().optional() },
        },
      ],
      result: { mode: "strict", typeSymbol: "ScopedMcpListResult", create: listResultSchema },
    },
    {
      id: "dsh-scoped-mcp#scopedMcpManager/save",
      service: "scopedMcpManager",
      namespace: "scopedMcpManager",
      method: "save",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "payload",
          wire: "payload",
          source: "json",
          codec: { mode: "strict", typeSymbol: "ScopedMcpSavePayload", create: savePayloadSchema },
        },
      ],
      result: { mode: "strict", typeSymbol: "ScopedMcpMutationResult", create: mutationResultSchema },
    },
    {
      id: "dsh-scoped-mcp#scopedMcpManager/removeServer",
      service: "scopedMcpManager",
      namespace: "scopedMcpManager",
      method: "removeServer",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "payload",
          wire: "payload",
          source: "json",
          codec: { mode: "strict", typeSymbol: "ScopedMcpRemovePayload", create: removePayloadSchema },
        },
      ],
      result: { mode: "strict", typeSymbol: "ScopedMcpMutationResult", create: mutationResultSchema },
    },
    {
      id: "dsh-scoped-mcp#scopedMcpManager/setEnabled",
      service: "scopedMcpManager",
      namespace: "scopedMcpManager",
      method: "setEnabled",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "payload",
          wire: "payload",
          source: "json",
          codec: { mode: "strict", typeSymbol: "ScopedMcpSetEnabledPayload", create: setEnabledPayloadSchema },
        },
      ],
      result: { mode: "strict", typeSymbol: "ScopedMcpMutationResult", create: mutationResultSchema },
    },
    {
      id: "dsh-scoped-mcp#scopedMcpManager/test",
      service: "scopedMcpManager",
      namespace: "scopedMcpManager",
      method: "test",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "payload",
          wire: "payload",
          source: "json",
          codec: { mode: "strict", typeSymbol: "ScopedMcpTestPayload", create: testPayloadSchema },
        },
      ],
      result: { mode: "strict", typeSymbol: "ScopedMcpTestResult", create: testResultSchema },
    },
  ],
  model: { services: [], events: [], objects: [] },
};

export default TYPERT;
