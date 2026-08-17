# dsh-notify-sound

A DeepSeek Harness (DSH) Web plugin that plays a short notification chime when
the session needs your attention:

- **Task complete** — a turn ends normally (`turn/end` with
  `reason.kind === "completed"`), or a durable goal transitions to
  `phase: "complete"`.
- **Asking the user** — the agent's question flow appears
  (`[data-question-key]`), including the plan-review variant
  (`[data-plan-review-key]`) and tool-approval cards (`[data-approval-key]`).

By default the chime is generated in the browser with the Web Audio API, so no
audio file or host-side dependency is required. Complete uses a short ascending
"ding-dong"; questions use a descending "dong-ding". You can optionally replace
either sound with your own audio file (URL or data URI) through the plugin row
config — see [Configuration](#configuration).

## How it works

- **Browser half** (`lib/client.js`) registers a `conversationEvents`
  definition that observes live `turn/end` and `goal/change` events. Historical
  replay is suppressed by ignoring events older than the plugin load time, so
  refreshing the page does not replay old chimes.
- A `MutationObserver` watches for question, plan-review, and approval cards.
  Cards already visible when the plugin loads are recorded but not replayed.
- The audio context is created lazily and resumed on the first pointer/key/touch
  interaction, which keeps it compatible with browser autoplay policies.

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
dsh plugin --profile web remove dsh-notify-sound
```

## Configuration

The plugin registers a **Settings → Plugins → Plugin configuration** card. In
the DSH Web settings UI you can edit:

- completion sound URL / data URI
- question sound URL / data URI
- volume
- enabled/disabled

The card writes the `notify-sound` settings namespace and the browser half
picks changes up immediately. Each sound field has a **Preview** / **试听**
button that plays the currently entered value (including unsaved edits) at the
current volume, so you can audition the sound before saving.

You can also configure the same values in the profile's own
`cordis.patch.yml` (for the `web` profile:
`~/.dsh/profiles/web/cordis.patch.yml`) as the composition/base layer:

```yaml
- id: notify-sound
  config:
    # Optional: replace the generated completion chime with an audio file.
    # Use an http(s) URL, a data URI, or a URL served by the DSH web app.
    completeSound: "https://example.com/complete.mp3"
    # Optional: replace the generated question chime.
    questionSound: "data:audio/wav;base64,..."
    # Optional: volume 0..1, used for both file and generated sounds.
    volume: 0.4
    # Optional: set false to disable the plugin.
    enabled: true
```

A raw local filesystem path such as `C:\sound.mp3` cannot be played directly by
the browser. Use a web-served URL, a data URI, or place the file somewhere the
DSH web server can serve and reference that URL. When `completeSound` /
`questionSound` is omitted, the built-in synthesized chime is used.

## Notes / limitations

- The default chime volume is `0.4`; override it with the `volume` config.
- If a configured audio file fails to load or play, the plugin falls back to
  the built-in Web Audio chime.
- If the browser blocks autoplay before any user interaction, the first chime
  may be silent. It will start working after the user clicks/types in the page.
- `lib/` is the shipped, hand-authored source (plain JavaScript, no build step).
  The host half is a no-op ESM entry; the browser half uses the
  `window.__ModuleLoader__` factory form.
