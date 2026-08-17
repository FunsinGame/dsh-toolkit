# dsh-chat-fileref

A DeepSeek Harness (DSH) Web plugin that linkifies file references in chat
messages. Text prefixed with `@` (an `@` mention of a file path) is rendered as
a blue, clickable basename; clicking opens the file in an external editor
(VS Code by default) and, when a line is referenced, jumps to that line.

```
@dist\server.js:7-12            →  server.js:7-12   (opens server.js at line 7)
@dist\server.js                 →  server.js
@C:\g-workspace\...\server.js   →  server.js
@src/utils/helper.ts:42         →  helper.ts:42     (opens helper.ts at line 42)
```

The `@` is a trigger only — it is not part of the opened path. A path without
the leading `@` is left as plain text.

## How it works

- **Browser half** (`lib/client.js`) observes the conversation DOM and scans
  `user` and `assistant-step` message content for `@`-prefixed file references
  (`@name.ext` with at least one directory separator or a Windows drive, plus an
  optional `:line` / `:line-line` suffix). Matches are replaced with
  `[data-fileref]` buttons showing the basename (plus the line suffix); the `@`
  trigger is dropped. Code blocks, links, buttons, and KaTeX are left untouched,
  and relative paths are resolved against the current session's workspace `cwd`
  before opening.
- The same detector drives a **live composer strip** registered in the
  `conversation.input.dock` slot: as you type or paste a path, clickable
  basename chips appear above the input box. A native `<textarea>` cannot host
  inline clickable links, so the strip is the interactive affordance while
  composing (the sent message is still linkified inline).
- **Host half** (`lib/index.js`) registers a Typert Remote service
  (`fileref/openFile`) that spawns the configured editor command. The strict
  invocation descriptor is shipped in `lib/typert.host.js` and picked up
  automatically by the typert-loader. On Windows the editor is resolved
  robustly: a bare `code` is located through `where` and the standard VS Code
  install locations, so the DSH server process does not need `code` on its own
  `PATH`.

## Install

The plugin is a standard DSH profile bundle. From this directory, install it
into a profile with:

```sh
dsh plugin --profile web add .
```

This forwards to `pnpm add` inside the profile directory and reconciles the
`dsh.profile.bundles` layer list. Restart the `web` profile afterwards.

To remove it:

```sh
dsh plugin --profile web remove dsh-chat-fileref
```

## Configuration

The external editor is the `editor` config on the plugin row (default `code`).
Override it in the profile's own `cordis.patch.yml`:

```yaml
- id: chat-fileref
  config:
    editor: cursor
```

Or set the host environment variable `DSH_CHAT_FILEREF_EDITOR` (the row config
wins when both are present). Any editor that understands
`<editor> --goto <path>:<line>` works with the default open form.

## Development (link: install)

When the plugin is installed with `dsh plugin add .` (a `link:` dependency), its
Node half is imported from this workspace, so its imports must resolve here.
Run `pnpm install` once after cloning to install the host-face peer dependencies
(`@deepseek-ai/cordis`, `@deepseek-ai/dsh-typert-protocol`) and `zod` locally.

## Notes / limitations

- A reference must be `@`-prefixed and the path requires an extension on the
  final segment plus at least one directory separator (or a drive letter), so
  prose like `a\b`, bare words, and emails are never linked. Files without an
  extension are not detected.
- Relative paths resolve against the current session's workspace `cwd`; if no
  session `cwd` is available they are handed to the editor as-is.
- `lib/` is the shipped, hand-authored source (plain JavaScript, no build step).
  The Host half is ESM; the browser half uses the `window.__ModuleLoader__`
  factory form (no JSX/TypeScript/React).
