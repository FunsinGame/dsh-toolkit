# DSH patch for external composer input

This is the source change in `C:\g-workspace\deepseek-harness\dsh-console`
(0.2.1-rc.2) that lets a local editor place a file reference into an open
Session's composer. The extension in this directory is the other half.

## Flow

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

## Changed files

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

Written on Web-app activation and removed on disposal, at **both**:

- `$DSH_HOME/runtime/external-input/<pid>.json`
- `~/.dsh/runtime/external-input/<pid>.json`

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
`~/.dsh`, and deduplicates instances by pid.

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

The installed `DeepSeek Harness` desktop app is the packaged 0.2.1 runtime and
does **not** contain this patch. Run the built `dsh web` instance, or rebuild
the desktop package from this source.

## Verification performed

- Unauthorized insert: `401`.
- Malformed body: `400`.
- No connected Client: `202 {"ack":"timeout"}` after ~1.5 s.
- Connected headless Edge page, no visible error: `200
  {"ok":true,"sessionId":"…"}`; the composer showed `extension.ts:10-12`.
- Clicking the composer chip opened the right Sidebar and scrolled line 10 into
  view (`scrollTop` 187 with a 19 px line height).
- `fileReferenceRule` parses unquoted, quoted, ranged, and plain mentions.
