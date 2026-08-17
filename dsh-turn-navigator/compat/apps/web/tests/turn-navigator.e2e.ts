import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { createChatScrollFixture } from './chat-scroll-fixture.ts'
import {
  launchWebScaffold, seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const MODE = webSnapshotMode()
const OVERLAY = fileURLToPath(new URL('./turn-navigator.cordis.e2e.yml', import.meta.url))
const PLUGIN_ROOT = process.env.DSH_TURN_NAVIGATOR_PATH
const LONG = createChatScrollFixture({
  markerPrefix: 'TURN_NAV', title: 'TURN_NAV six turns', turns: 6,
})
const SHORT = createChatScrollFixture({
  markerPrefix: 'TURN_NAV_SHORT', title: 'TURN_NAV two turns', turns: 2,
})

async function nextPaint(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>(resolve => requestAnimationFrame(() => {
      requestAnimationFrame(() => { resolve() })
    }))
  })
}

async function openByMarker(page: Page, marker: string): Promise<void> {
  const search = page.getByRole('textbox', { name: 'Search name, keywords...', exact: true })
  await search.fill(marker)
  const result = page.getByRole('tree', { name: 'Search results' }).getByRole('treeitem').first()
  await result.waitFor({ timeout: 30_000 })
  await result.click()
  await result.click()
  await nextPaint(page)
}

describe('web e2e: external turn navigator plugin', () => {
  let browser: Browser
  let page: Page
  let scaffold: WebScaffold
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    if (PLUGIN_ROOT === undefined || PLUGIN_ROOT === '') {
      throw new Error('DSH_TURN_NAVIGATOR_PATH must name the external plugin checkout')
    }
    scaffold = await launchWebScaffold({
      extraOverlayPath: OVERLAY,
      externalPluginPaths: [PLUGIN_ROOT],
    })
    await seedSession(scaffold, LONG.log, 'turn-navigator-long')
    await seedSession(scaffold, SHORT.log, 'turn-navigator-short')
    browser = await chromium.launch()
    page = await newEnglishPage(browser, 900)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.getByText(/^2 sessions$/, { exact: true }).waitFor({ timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    const failures: unknown[] = []
    await browser?.close().catch((error: unknown) => failures.push(error))
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'turn navigator cleanup failed')
  })

  it.skipIf(MODE === 'record')('shows at three turns, previews, jumps, follows scroll, and hides below the threshold', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-turn-navigator'))
    await openByMarker(page, LONG.markers.user(1))
    await page.getByText(LONG.markers.assistant(6), { exact: false }).last().waitFor({ timeout: 30_000 })

    const nav = page.getByRole('navigation', { name: 'Conversation turn navigation' })
    const markers = nav.getByRole('button')
    await expect.poll(() => markers.count(), { timeout: 10_000 }).toBe(6)
    expect(await markers.nth(5).getAttribute('aria-current')).toBe('step')
    const railLayout = await nav.evaluate((rail) => {
      const buttons = [...rail.querySelectorAll('button')]
      const first = buttons.at(0)?.getBoundingClientRect()
      const last = buttons.at(-1)?.getBoundingClientRect()
      if (first === undefined || last === undefined) throw new Error('turn markers are absent')
      const bounds = rail.getBoundingClientRect()
      return {
        centerOffset: Math.abs((first.top + last.bottom) / 2 - (bounds.top + bounds.bottom) / 2),
        groupHeight: last.bottom - first.top,
      }
    })
    expect(railLayout.centerOffset).toBeLessThan(2)
    expect(railLayout.groupHeight).toBeLessThan(100)

    await markers.nth(2).hover()
    expect(await nav.textContent()).toContain('Turn 3')
    expect(await nav.textContent()).toContain(LONG.markers.user(3))
    await markers.nth(2).click()
    await expect.poll(() => markers.nth(2).getAttribute('aria-current'), { timeout: 10_000 }).toBe('step')
    const thirdUser = page.locator('[data-chat-flow-kind="user"]').nth(2)
    await expect.poll(async () => thirdUser.evaluate((row) => {
      const host = row.closest<HTMLElement>('[data-conversation-scroll]')
      if (host === null) throw new Error('conversation scroll owner is absent')
      return Math.abs(row.getBoundingClientRect().top - host.getBoundingClientRect().top)
    }), { timeout: 10_000 }).toBeLessThan(2)

    await page.locator('[data-conversation-scroll]').evaluate((host) => {
      const row = host.querySelector<HTMLElement>('[data-chat-flow-kind="user"]')
      if (row === null) throw new Error('first user row is absent')
      ;(host as HTMLElement).scrollTop += row.getBoundingClientRect().top - host.getBoundingClientRect().top
      host.dispatchEvent(new Event('scroll'))
    })
    await nextPaint(page)
    await expect.poll(() => markers.nth(0).getAttribute('aria-current'), { timeout: 10_000 }).toBe('step')

    await openByMarker(page, SHORT.markers.user(1))
    await page.getByText(SHORT.markers.assistant(2), { exact: false }).last().waitFor({ timeout: 30_000 })
    await expect.poll(() => page.locator('[data-turn-navigator]').count(), { timeout: 10_000 }).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 120_000)
})
