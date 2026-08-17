# dsh-turn-filediff

A DeepSeek Harness (DSH) Web plugin that records the files a conversation turn
modified and renders a collapsible summary bar under each closing assistant
message:

```
> 3 files modified  +142  -18
```

Clicking the bar expands the per-file list. Each file row shows its
`+added -removed` counts and two buttons:

- **打开 (Open)** — open the file in the external editor at the first changed
  line (VS Code by default, via `code --goto path:line`), falling back to the
  chat view's default file opener when the editor handoff fails.
- **差异 (Diff)** — open the change in the editor's diff view. The plugin
  accumulates every applied `FileDiff` hunk for the file, then reconstructs the
  full before/after text by reverse-applying those hunks to the file's current
  content and writes the snapshots to temporary files for `code --diff before
  after`. This shows the whole turn's changes for the file, not just the last
  hunk.

## How it works

- **Browser half** (`lib/client.js`) registers a per-turn accumulator with the
  client `conversationEvents` registry. It reads the `diff` render intent of
  settled `write`/`edit` tool results (the applied `FileDiff` list with
  `oldText`/`newText`), computes exact added/removed line counts per file, and
  keeps every hunk in order so the Diff action can reconstruct the full change.
  It renders the summary into the existing `conversation.chat.turnTail` slot.
  That slot is a chain that elects a single entry (first non-null `select`
  wins), and the shipped "Produced" files row (`ui-deliverables`) registers
  first — so the bundle disables `ui-deliverables` and replaces its turn-tail
  row, its inline file-mention resolver, and its model guidance.
- **Host half** (`lib/index.js`) registers a Typert Remote service with two
  methods — `turnFilediff/openFile` (open at line) and `turnFilediff/openDiff`
  (diff view) — that spawn the configured editor command. The strict invocation
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
  command that rewrites a file) carry no diff render intent, so they are not
  counted — the same boundary as the shipped produced-files row. Diff stats
  come from the mutation tools' own `FileDiff` vocabulary.
- `lib/` is the shipped, hand-authored source (plain JavaScript, no build step).
  The Host half is ESM; the browser half uses the `window.__ModuleLoader__`
  factory form and `React.createElement` (no JSX/TypeScript).
