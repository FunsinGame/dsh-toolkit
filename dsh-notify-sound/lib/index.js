/**
 * dsh-notify-sound — Host half.
 *
 * Registers the `notify-sound` settings namespace so the Web settings Plugins
 * tab can expose a configuration card for this plugin. The card writes the
 * same namespace the browser half reads, so changes made in the UI take effect
 * without editing cordis.patch.yml by hand.
 */
import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";

/** Settings namespace owned by this plugin. */
export const NOTIFY_SOUND_NS = settingsNamespace("notify-sound");

/** Schema for the plugin's user-facing settings. */
export const NotifySoundConfig = z.object({
  /** Optional custom audio for task-complete chimes (URL/data URI). */
  completeSound: z.string().default(""),
  /** Optional custom audio for question/approval chimes (URL/data URI). */
  questionSound: z.string().default(""),
  /** Volume 0..1 for both generated and file-based chimes. */
  volume: z.number().default(0.4),
  /** Master switch. */
  enabled: z.boolean().default(true),
});

/**
 * @param ctx - host Cordis context.
 * @param config - plugin row config from cordis.patch.yml; used as the
 * settings namespace's composition/base layer.
 */
export function apply(ctx, config = {}) {
  const base = {
    completeSound:
      typeof config.completeSound === "string" ? config.completeSound : "",
    questionSound:
      typeof config.questionSound === "string" ? config.questionSound : "",
    volume: typeof config.volume === "number" ? config.volume : 0.4,
    enabled: config.enabled !== false,
  };

  installSettingsSection(ctx, NOTIFY_SOUND_NS, NotifySoundConfig, base, {
    // The browser half owns playback behavior; the Host only provides the
    // settings document, so no source/change handling is needed here.
    setSource() {},
    onChange() {},
  });
}

export default { apply };
