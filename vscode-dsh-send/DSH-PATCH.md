# DSH patch for external composer input

This records the source change in `C:\g-workspace\deepseek-harness\dsh-console`
(0.2.1-rc.2) that first let a local editor place a file reference into an open
Session's composer. The extension in this directory is the other half. 0.2.2
upstreamed the Host half and changed its admission model; read the next section
before the historical one.

## Upstream status (0.2.2)

The entry was upstreamed: `@deepseek-ai/dsh-web-app` now ships
`lib/external-input.js` itself, so the 0.2.1 source patch below is obsolete.

It arrived with one regression. Since 0.2.2 the Host runs every matched web
route through `webserver/authorize` **before** the route's own handler
(`dsh-host-webserver`), and an omitted `auth` policy means `required`
(`authPolicy` returns `auth ?? "required"`). `dsh-client-connection` answers
that hook by resolving the request's session credential, so the route's own
`Authorization: Bearer` check is never reached: every insert answers
`401 unauthorized` from the gate, with a plain-text body, not the route's
`{"error":"unauthorized"}` JSON.

The fix belongs in the route registration, next to the existing opt-out on
`CONNECT_PATH`:

```ts
ctx.webServer.register({
  kind: 'exact',
  path: EXTERNAL_INPUT_INSERT_PATH,
  auth: 'anonymous',          // <- the route authenticates itself
  handler: (request, response) => { void handleInsert(request, response) },
})
```

until then, the extension sends the session cookie the gate wants as well; see
"Two credentials" in `README.md`.

## Source patch (0.2.1 only)

### Flow

```
VS Code: discovery file -> POST /external-input/v1/insert (Bearer token)
Host:    ctx.emit('composer/insert', payload)          (forwarded Remote event)
Client:  ctx.remote.$on('composer/insert', ...)        (ui-reference)
         -> ctx.conversation.input.for(scope).insertReferenceAtCaret(...)
Client:  POST /external-input/v1/ack (requestId + ackToken)
Host:    answers the waiting POST with the Client outcome
```

The route can only ask a Client to insert a reference or plain text. It cannot
read a Session, submit a prompt, or call a Remote method.

### Changed files

| File | Change |
|---|---|
| `packages/api/remotes/src/remote-events.ts` | `ComposerInsertRequest` payload + `composer/insert` (`mode: 'emit'`) in the allowlist |
| `packages/api/remotes/src/types.ts` | Re-export `ComposerInsertRequest` from the client-safe type face |
| `packages/api/remotes/src/index.ts` | Host re-export of `ComposerInsertRequest` |
| `packages/api/remotes/src/client/index.ts` | Client re-export of `ComposerInsertRequest` |
| `packages/bundle/web-app/src/external-input.ts` | New: loopback insert/ack routes, discovery file, event emission |
| `packages/bundle/web-app/src/index.ts` | Calls `installExternalInput(ctx)` |
| `packages/client/ui-conversation/src/client/contract/input.ts` | `SessionInput.insertReferenceAtCaret` / `insertTextAtCaret` |
| `packages/client/ui-conversation/src/client/input/facade.ts` | Implement both caret insertions |
| `packages/client/ui-reference/src/client/reference-target.ts` | New: parse `@path` / `@"path"` with an optional `#L12` / `#L12-L30` fragment |
| `packages/client/ui-reference/src/client/user-text-rules.ts` | Range-aware file/path rule and label (`name:12-30`) |
| `packages/client/ui-reference/src/client/FileReference.tsx` | Click passes the parsed line |
| `packages/client/ui-reference/src/client/index.ts` | `openReference` line navigation; `composer/insert` listener and ack; `conversation` injection |
| `packages/client/ui-reference/tsconfig.json` | References the document-preview project for the `file` navigation params |

## Discovery file

Written after both routes register and removed on disposal, at **both**:

- `$DSH_HOME/runtime/external-input/<pid>-<nonce>.json`
- `~/.dsh/runtime/external-input/<pid>-<nonce>.json`

The per-mount nonce matters because one process can mount the Web surface
more than once (developer reloads, secondary windows). A shared `<pid>.json`
let a disposing or failing mount delete a sibling's live record, which made
discovery flicker and removed a record an editor had just read.

`$DSH_HOME` follows the existing home-paths rule: the environment value, else
`~/.dsh`. The user-level copy is what lets an editor find an instance whose
Host was launched with a non-default home — for example the desktop
development build, whose home lives under
`apps/desktop/.desktop-build/development/home`.

```json
{
  "schema": 1,
  "pid": 12345,
  "port": 58544,
  "url": "http://127.0.0.1:58544",
  "token": "<process-local bearer token>",
  "cwd": "<Host process cwd>",
  "startedAt": "..."
}
```

The extension searches `dshSend.home` (when set), its own `DSH_HOME`, then
`~/.dsh`; keeps the newest record per pid; and, for directory discovery only,
drops records whose endpoint no longer answers. The last step matters because a
record outlives its Host until the next cleanup and Windows reuses process ids,
so a months-old record can name a live but unrelated process.

## Range syntax

A reference chip's `ref` is prompt text:

- whole file: `@C:\repo\a.ts` or `@"C:\a b\a.ts"`
- range: `@C:\repo\a.ts#L12-L30` or `@"C:\a b\a.ts"#L12-L30`

The chip label is `a.ts:12-30`. Clicking it opens the file in the right
Sidebar with `navigation.params.line = 12`; the text preview scrolls to that
line. A submitted user message renders the same chip through the file text
rule.

## Build and run

```powershell
cd C:\g-workspace\deepseek-harness\dsh-console
pnpm run build:lib          # host + client bundles
pnpm dsh web --host 127.0.0.1 --port 0 --no-open
```

The packaged `DeepSeek Harness` desktop app (0.2.2-rc.3 as installed) already
contains the entry, so no patched build is needed — only the `auth: 'anonymous'`
fix above, or the extension's session cookie.

## Verification performed

- 0.2.2 desktop app, 2026-11-18: `GET /external-input/v1/insert` without a
  cookie answers `401 unauthorized` (gate, plain text); with a cookie minted
  from `.credentials.yaml` it answers `405 {"error":"method"}` (gate passed,
  route reached); a wrong cookie or a missing bearer answers `401`; a real
  `POST` with both answers `200 {"accepted":true,"ok":true,"sessionId":"…"}`.
- 0.2.1 source build:
  - Unauthorized insert: `401`.
  - Malformed body: `400`.
  - No connected Client: `202 {"ack":"timeout"}` after ~1.5 s.
  - Connected headless Edge page, no visible error: `200
    {"ok":true,"sessionId":"…"}`; the composer showed `extension.ts:10-12`.
  - Clicking the composer chip opened the right Sidebar and scrolled line 10 into
    view (`scrollTop` 187 with a 19 px line height).
  - `fileReferenceRule` parses unquoted, quoted, ranged, and plain mentions.
