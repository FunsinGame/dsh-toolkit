/**
 * Reveal the export directory in the operating system's file manager.
 *
 * The page cannot open a local folder (browsers refuse `file://` navigation),
 * so the host does it. The path is always the plugin's own export root and is
 * never accepted from the request, which keeps this from becoming an
 * arbitrary-directory opener.
 */

import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'

export async function openDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true })
  const command =
    process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [directory], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
    child.once('error', (error) => reject(error))
  })
}
