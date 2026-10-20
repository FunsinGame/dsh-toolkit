/**
 * `@huggingface/transformers`, resolved at runtime instead of bundled.
 *
 * The real package is hundreds of megabytes of weights plus native ONNX runtimes, so
 * bundling it is not an option and requiring it unconditionally would make the plugin
 * unusable on machines that only want keyword search. The host half loads whichever
 * copy it can find (plugin node_modules, the SoundDesk checkout, or the configured
 * reference directory) and publishes it on a global before starting the engine; this
 * shim is what the engine's dynamic `import('@huggingface/transformers')` lands on.
 *
 * The five names below are the entire surface `embedder.ts` reads. Keeping the shim
 * thin means a missing global fails exactly where the engine already expects a missing
 * model — as a disabled capability, not a crash.
 */

interface TransformersLike {
  env?: Record<string, unknown>
  AutoTokenizer?: unknown
  AutoProcessor?: unknown
  ClapTextModelWithProjection?: unknown
  ClapAudioModelWithProjection?: unknown
}

function lib(): TransformersLike {
  const global = globalThis as unknown as { __DSH_SOUND_DESK_TRANSFORMERS__?: TransformersLike }
  return global.__DSH_SOUND_DESK_TRANSFORMERS__ ?? {}
}

export const env = lib().env
export const AutoTokenizer = lib().AutoTokenizer
export const AutoProcessor = lib().AutoProcessor
export const ClapTextModelWithProjection = lib().ClapTextModelWithProjection
export const ClapAudioModelWithProjection = lib().ClapAudioModelWithProjection

export default lib()
