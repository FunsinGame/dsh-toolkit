#!/usr/bin/env node
/**
 * Standalone notes server launcher.
 *
 * The real implementation is the self-contained bundle in ./lib/server.js,
 * produced by scripts/build.mjs. Keeping this file tiny means the same command
 * works on Windows, Linux and Debian without a build step on the server.
 */
import { main } from './lib/server.js'

main(process.argv.slice(2)).catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error(`[dsh-notes] ${message}`)
  process.exitCode = 1
})
