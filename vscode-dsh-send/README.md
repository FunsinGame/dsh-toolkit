# DSH Send

Send a file or a code range from VS Code into the composer of a running
DeepSeek Harness instance.

## Menus

| Where | Command | Payload |
|---|---|---|
| File tab context menu (`editor/title/context`) | **发送文件到 DSH** | the file's absolute path |
| Explorer context menu | **发送文件到 DSH** | the file's absolute path |
| Editor context menu, with or without a selection | **发送代码段到 DSH** | absolute path + 1-based inclusive line range: the selected lines, or the cursor's line |

The composer receives a file reference chip:

- whole file: `name` — click opens the file in the right Sidebar;
- range: `name:12-30` — click opens the file at line 12.

The model-facing text is `@<absolute path>` or `@<absolute path>#L12-L30`.

## How it works

The extension owns no server. It reads the instance records the Host writes
under `$DSH_HOME/runtime/external-input` and mirrors to
`~/.dsh/runtime/external-input`, drops records whose endpoint no longer
answers, picks the instance whose workspace matches the current VS Code folder,
and POSTs one request to `/external-input/v1/insert`. Candidate homes are
`dshSend.home` (when set), the extension host's `DSH_HOME`, and `~/.dsh`. The
Host broadcasts it to every open DSH page through the forwarded Remote-event
channel; the page that owns the active Session inserts the reference at its
caret and acknowledges the request. The extension reports the acknowledgement.

### Two credentials

The request carries two independent ones, because DSH checks them at two
layers:

| Header | What it is | Checked by |
|---|---|---|
| `Authorization: Bearer <token>` | the per-process capability token in the instance record | the `/external-input/v1/insert` route |
| `Cookie: dsh-auth-…` | a session cookie derived from `$DSH_HOME/.credentials.yaml` | the Host's web admission gate |

DSH 0.2.2 admits *every* web route through `webserver/authorize` before the
route's own handler, and the external-input route declares no auth policy, so
it inherits `required`. A capability token alone therefore never reaches the
route — it is answered `401 unauthorized` by the gate. The extension reads the
browser-session signing secret from `.credentials.yaml`, signs the same
one-day cookie DSH's token provider accepts, and shortens its own credential
when a Host recreates that record (one retry after a `401`).

`~/.dsh/.credentials.yaml` is user-only; if it is missing, so is the cookie, and
sending reports that rather than a bare `401`.

## Build

```powershell
npm install
npm run build
npx --yes @vscode/vsce package --no-dependencies
code --install-extension .\vscode-dsh-send-0.1.2.vsix
```

## Settings

| Key | Default | Meaning |
|---|---|---|
| `dshSend.home` | `""` | DSH home; empty follows `DSH_HOME`, then `~/.dsh`. |
| `dshSend.instance` | `""` | Optional exact instance JSON file instead of directory discovery. |

## Requirements

- A DSH runtime that serves the external-input entry: any 0.2.2 build (the
  packaged desktop app included). A 0.2.1 runtime needs the source patch
  described in `DSH-PATCH.md`.
- At least one DSH page open with a Session showing its composer.
- VS Code running as the same user as DSH, so the extension can read that
  user's `~/.dsh`.

If no instance file answers, the command offers to copy the launch command:
`dsh web --host 127.0.0.1 --port 0`.

## Troubleshooting

| Message | Cause |
|---|---|
| `无法连接 DSH：DSH answered HTTP 401` | neither credential was accepted: the session secret is unreadable or from another DSH home, or the instance record is stale. Check the **DSH Send** output channel for the searched homes. |
| `请求已发出，但没有打开的 DSH 会话接收` | admission and token both passed; no page had an active Session within 1.5 s. |
| `没有发现正在运行的 DSH 实例` | no record's endpoint answered. |
