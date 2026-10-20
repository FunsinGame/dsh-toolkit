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

The extension owns no server. It reads the instance records the patched Host
writes under `$DSH_HOME/runtime/external-input` and mirrors to
`~/.dsh/runtime/external-input`, picks the instance whose workspace matches
the current VS Code folder, and POSTs one authenticated request to
`/external-input/v1/insert`. Candidate homes are `dshSend.home` (when set),
the extension host's `DSH_HOME`, and `~/.dsh`. The Host broadcasts it
to every open DSH page through the existing forwarded Remote-event channel;
the page that owns the active Session inserts the reference at its caret and
acknowledges the request. The extension reports the acknowledgement.

The Host-side change lives in `C:\g-workspace\deepseek-harness\dsh-console`
and is documented in `DSH-PATCH.md` beside this file.

## Build

```powershell
npm install
npm run build
npx --yes @vscode/vsce package --no-dependencies
code --install-extension .\vscode-dsh-send-0.1.0.vsix
```

## Settings

| Key | Default | Meaning |
|---|---|---|
| `dshSend.home` | `""` | DSH home; empty follows `DSH_HOME`, then `~/.dsh`. |
| `dshSend.instance` | `""` | Optional exact instance JSON file instead of directory discovery. |

## Requirements

- A DSH runtime built from the patched source. The packaged desktop app
  (`0.2.1-rc.2` as installed) does not contain the external-input entry.
- At least one DSH page open with a Session showing its composer.

If no instance file is found, the command offers to copy the launch command:
`dsh web --host 127.0.0.1 --port 0`.
