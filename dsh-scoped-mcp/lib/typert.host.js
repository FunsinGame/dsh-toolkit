/**
 * dsh-scoped-mcp Typert host manifest.
 *
 * Strict invocation descriptors for the `scopedMcpManager` remote service.
 * The host service implementation lives in ./mcp-service.js.
 */
import { z } from "zod";

const serverSchema = z.object({
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
}).passthrough();

const serverViewSchema = serverSchema.extend({
  scope: z.string().optional(),
}).passthrough();

const scopeViewSchema = z.object({
  kind: z.enum(["global", "workspace"]),
  path: z.string().nullable().optional(),
  label: z.string().optional(),
  servers: z.array(serverViewSchema).default([]),
}).passthrough();

const listResultSchema = z.object({
  global: scopeViewSchema,
  workspace: scopeViewSchema.nullable().optional(),
  currentCwd: z.string().nullable().optional(),
}).passthrough();

const savePayloadSchema = z.object({
  sessionId: z.string().optional(),
  scope: z.string(),
  server: serverSchema,
  previousServerName: z.string().optional(),
}).passthrough();

const removePayloadSchema = z.object({
  sessionId: z.string().optional(),
  scope: z.string(),
  serverName: z.string(),
}).passthrough();

const setEnabledPayloadSchema = z.object({
  sessionId: z.string().optional(),
  scope: z.string(),
  serverName: z.string(),
  enabled: z.boolean(),
}).passthrough();

const testPayloadSchema = z.object({
  sessionId: z.string().optional(),
  scope: z.string().optional(),
  serverName: z.string().optional(),
  server: serverSchema.optional(),
}).passthrough();

const testResultSchema = z.object({
  ok: z.boolean(),
  tools: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
  })).default([]),
  error: z.string().optional(),
}).passthrough();

const mutationResultSchema = z.object({
  ok: z.boolean(),
  scope: z.string(),
  servers: z.array(serverViewSchema).default([]),
  error: z.string().optional(),
}).passthrough();

const SERVER_REF = { type: "object" };

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
          codec: { mode: "strict", typeSymbol: "SessionId", schema: z.string().optional() },
        },
      ],
      result: { mode: "strict", typeSymbol: "ScopedMcpListResult", schema: listResultSchema },
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
          codec: { mode: "strict", typeSymbol: "ScopedMcpSavePayload", schema: savePayloadSchema },
        },
      ],
      result: { mode: "strict", typeSymbol: "ScopedMcpMutationResult", schema: mutationResultSchema },
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
          codec: { mode: "strict", typeSymbol: "ScopedMcpRemovePayload", schema: removePayloadSchema },
        },
      ],
      result: { mode: "strict", typeSymbol: "ScopedMcpMutationResult", schema: mutationResultSchema },
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
          codec: { mode: "strict", typeSymbol: "ScopedMcpSetEnabledPayload", schema: setEnabledPayloadSchema },
        },
      ],
      result: { mode: "strict", typeSymbol: "ScopedMcpMutationResult", schema: mutationResultSchema },
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
          codec: { mode: "strict", typeSymbol: "ScopedMcpTestPayload", schema: testPayloadSchema },
        },
      ],
      result: { mode: "strict", typeSymbol: "ScopedMcpTestResult", schema: testResultSchema },
    },
  ],
  model: { services: [], events: [], objects: [] },
};

export default TYPERT;
