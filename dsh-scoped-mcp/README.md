# dsh-scoped-mcp

Workspace-scoped MCP manager for DSH. Unlike a plain `@deepseek-ai/dsh-mcp-client`
instance (which is global to a profile), this plugin stores MCP server
configuration per scope and dynamically registers the matching MCP tools on
each agent's scoped tool context.

The Web settings page also gets an **MCP** section where you can add, edit,
enable/disable, delete, and **test connection** for global and current-workspace
servers.

- **Global scope**: `~/.dsh/mcp-scope.yml`
- **Workspace scope**: `<workspace>/.dsh/mcp.yml`

A workspace server with the same `serverName` as a global server overrides it;
all other global servers remain visible to every workspace.

## Install

```bash
dsh plugin --profile web add C:/g-workspace/deepseek-harness/dsh-toolkit/dsh-scoped-mcp
dsh-restart
```

## CLI

```bash
dsh-scoped-mcp --help
dsh-scoped-mcp list [--scope global|PATH]
dsh-scoped-mcp add --scope global|PATH --name <serverName> --stdio --command <cmd> [--args ...] [--env K=V ...]
dsh-scoped-mcp add --scope global|PATH --name <serverName> --http --url <url> [--header K=V ...]
dsh-scoped-mcp remove --scope global|PATH --name <serverName> [--yes]
dsh-scoped-mcp enable --scope global|PATH --name <serverName>
dsh-scoped-mcp disable --scope global|PATH --name <serverName>
dsh-scoped-mcp test --scope global|PATH --name <serverName>
```

Examples:

```bash
# Global server available to every workspace
dsh-scoped-mcp add --scope global --name github --stdio --command npx \
  --args -y @modelcontextprotocol/server-github \
  --env GITHUB_TOKEN=xxx

# Workspace-only server for C:/work/project-a
dsh-scoped-mcp add --scope C:/work/project-a --name internal-api --http \
  --url http://localhost:3000/mcp --header Authorization=Bearer xxx
```

## Runtime behavior

When a DSH agent/session is created, the plugin:

1. finds the workspace project root from the session cwd;
2. loads `~/.dsh/mcp-scope.yml` plus `<workspace>/.dsh/mcp.yml` and merges them;
3. starts each enabled MCP server;
4. registers its tools on `agent.ctx.tools`, so the model for that session only
   sees the MCP tools of that workspace's scope;
5. disposes the connections and tools when the agent is disposed;
6. live-syncs running agents whenever the config is changed from the Web
   settings UI, so disabling a server also closes its already-open MCP
   connection immediately.

## Config file format

```yaml
servers:
  - serverName: github
    transport: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_TOKEN: xxx
    disabled: false

  - serverName: internal-api
    transport: streamable-http
    url: http://localhost:3000/mcp
    headers:
      Authorization: Bearer xxx
```

Supported fields mirror `@deepseek-ai/dsh-mcp-client`:

| Field | Required | Description |
|---|---|---|
| `serverName` | yes | `[A-Za-z0-9_-]{1,32}`, unique within the merged scope |
| `transport` | yes | `stdio` or `streamable-http` |
| `command` | stdio | executable to spawn |
| `args` | no | command arguments |
| `env` | no | extra environment variables |
| `cwd` | no | child working directory |
| `url` | http | MCP endpoint URL |
| `headers` | no | extra HTTP headers |
| `toolCallTimeoutMs` | no | per-call timeout, default `60000` |
| `failOnStartupError` | no | accepted for compatibility; current version logs and continues on failure |
| `reconnect.enabled` | no | accepted for compatibility; current version does not yet implement automatic reconnect |
| `disabled` | no | disable this server without removing it, default `false` |

## Notes

- This is a same-profile, per-session/workspace implementation; it does not
  require separate DSH profiles for different MCP server addresses.
- The first prompt of a brand-new agent may race with async MCP discovery; the
  tools are registered as soon as connection and `tools/list` complete.
- Reconnect and fail-on-startup options are stored in config for future
  compatibility; this first version starts the server once and unregisters it
  when the agent is disposed.
- Mutations made through the Web settings UI apply to running agents
  immediately. CLI edits are separate processes and are picked up by the next
  agent/session.
