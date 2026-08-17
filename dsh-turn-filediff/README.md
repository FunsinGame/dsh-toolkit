# dsh-turn-filediff

A DeepSeek Harness (DSH) Web plugin that records the files a conversation has
changed and renders a collapsible file list above the chat input box:

```
▸ 8 conversation file changes  3 added  2 deleted  5 modified
```

The list is **collapsed by default**. Clicking the bar expands a vertical list
of files; each file row shows its final conversation state — **新增 / Added**,
**删除 / Deleted**, or **修改 / Modified** — plus two actions:

- **打开 / Open** — open the file in the external editor at the first changed
  line (VS Code by default, via `code --goto path:line`), falling back to the
  chat view's default file opener when the editor handoff fails.
- **差异 / Diff** — open the conversation-level change in the editor's diff
  view. The plugin accumulates every applied `FileDiff` hunk for the file, then
  reconstructs the full before/after text by reverse-applying those hunks to the
  file's current content and writes the snapshots to temporary files for
  `code --diff before after`. This shows the whole conversation's changes for
  the file, not just the last hunk.

## Behavior

The plugin deliberately does **not** report a separate file-change list per
turn. Instead it maintains one conversation-wide summary:

1. **新增的文件 (Added)** — files that did not exist when the conversation
   started and still exist now.
2. **删除的文件 (Deleted)** — files that existed when the conversation started
   and no longer exist (or were reduced to empty by a mutation diff).
3. **修改的文件 (Modified)** — files that existed before and still exist, but
   whose content changed.

A file that was temporarily created and later deleted cancels out: it is not
shown in the final summary at all.

## How it works

- **Browser half** (`lib/client.js`) registers a conversation-wide accumulator
  with the client `conversationEvents` registry. Each turn's state starts from
  the previous turn's state (`reader.previous("turnFilediff")`), so file changes
  accumulate across the entire conversation instead of resetting at every
  `turn/start`. It reads the `diff` render intent of settled `write`/`edit`
  tool results (the applied `FileDiff` list with `oldText`/`newText`), computes
  exact added/removed line counts per hunk, keeps every hunk in order so the
  Diff action can reconstruct the full conversation change, and collapses each
  path to its final `added` / `deleted` / `modified` status.
- The file list is rendered into the existing `conversation.input.dock` slot,
  directly above the chat input box, so it stays visible for the whole session
  instead of being attached to one assistant turn.
- The plugin also replaces the `chatFileMentions` provider, so inline-code file
  references in assistant messages resolve against the conversation-wide
  changed-file vocabulary.
- **Host half** (`lib/index.js`) registers a Typert Remote service with two
  methods — `turnFilediff/openFile` (open at line) and `turnFilediff/openDiff`
  (diff view) — that spawn the configured editor command. When a tracked file no
  longer exists on disk, `openDiff` treats the current content as empty so a
  deletion can still be shown as a before/after diff. The strict invocation
  descriptors are shipped in `lib/typert.host.js` and picked up automatically
  by the typert-loader.

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
dsh plugin --profile web remove dsh-turn-filediff
```

## Configuration

The external editor is the `editor` config on the plugin row (default `code`).
Override it in the profile's own `cordis.patch.yml`:

```yaml
- id: turn-filediff
  config:
    editor: cursor
```

Or set the host environment variable `DSH_TURN_FILEDIFF_EDITOR` (the row config
wins when both are present). Any editor that understands
`<editor> --goto <path>:<line>` works with the default open form.

## Logs

The Host half logs every editor handoff with a `[turn-filediff]` prefix:
`openFile`/`openDiff` requests, VS Code bridge requests/responses, and any
fallback to the external editor command. In embedded VS Code mode these lines
are forwarded to the **DeepSeek Harness** output channel: open the Output panel
and select `DeepSeek Harness` from the channel list.

## Development (link: install)

When the plugin is installed with `dsh plugin add .` (a `link:` dependency), its
Node half is imported from this workspace, so its imports must resolve here.
Run `pnpm install` once after cloning to install the host-face peer dependencies
(`@deepseek-ai/cordis`, `@deepseek-ai/dsh-typert-protocol`) and `zod` locally.

## Notes / limitations

- Files modified indirectly through shell commands (e.g. a `bash`/`pwsh`
  command that rewrites or removes a file) carry no diff render intent, so they
  are not counted — the same boundary as the shipped produced-files row. Diff
  stats come from the mutation tools' own `FileDiff` vocabulary; shell-level
  `rm` is not observed by this plugin.
- Deletion is recognized when a mutation tool's diff reports an existing file
  becoming empty, and `openDiff` also supports a file that has disappeared from
  disk. A file that is created and later deleted is removed from the summary.
- `lib/` is the shipped, hand-authored source (plain JavaScript, no build step).
  The Host half is ESM; the browser half uses the `window.__ModuleLoader__`
  factory form and `React.createElement` (no JSX/TypeScript).
