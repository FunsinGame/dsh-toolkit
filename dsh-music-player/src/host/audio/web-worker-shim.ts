/**
 * The wasm decoder package imports `@eshaz/web-worker` at module scope even
 * when only the synchronous (non-worker) decoder is used. That package reaches
 * for Node's `url` through `require`, which an ESM bundle cannot provide.
 *
 * We never instantiate the worker class, so a tiny inert stand-in keeps the
 * import graph resolved without dragging in the worker runtime.
 */
export default class InertWorker {
  constructor() {
    throw new Error('dsh-music-player does not use the worker decoder')
  }
}
