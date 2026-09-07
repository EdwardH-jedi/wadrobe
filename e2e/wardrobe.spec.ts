import { test, expect, type Page } from '@playwright/test'

// Both navigations are always in the DOM and CSS decides which is visible, so
// every click has to go through the one this viewport actually shows. That is
// the whole point of running this suite at two widths.
async function goToView(page: Page, name: string) {
  const mobile = page.locator('.mobilenav')
  if (await mobile.isVisible()) {
    const tab = mobile.getByRole('button', { name: new RegExp(`^${name}`) })
    if ((await tab.count()) > 0) {
      await tab.click()
      return
    }
    // Everything without a permanent slot lives behind More.
    await mobile.getByRole('button', { name: 'More' }).click()
    await mobile
      .getByRole('button', { name: new RegExp(`^${name}`) })
      .click()
    return
  }
  await page
    .locator('.sidebar')
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .click()
}

// The sample archive is the only way to get real garments into the app without
// a canvas-driven upload, which is exactly the kind of brittleness this suite
// is meant to avoid.
async function loadSampleArchive(page: Page) {
  await page.goto('/')
  // The Closet is the landing view, and its empty state is the hydration signal.
  await expect(page.getByText('Your archive is empty')).toBeVisible()
  await page.getByRole('button', { name: /Load sample/i }).first().click()
  await expect(page.getByText('Your archive is empty')).toBeHidden()
}

test('archives the sample wardrobe and shows it in the closet', async ({ page }) => {
  await loadSampleArchive(page)

  const cards = page.locator('.garment-card')
  await expect(cards.first()).toBeVisible()
  expect(await cards.count()).toBeGreaterThan(0)
})

test('persists the archive across a real reload', async ({ page }) => {
  // The behaviour jsdom cannot prove: IndexedDB surviving a genuine navigation.
  await loadSampleArchive(page)
  const before = await page.locator('.garment-card').count()
  expect(before).toBeGreaterThan(0)

  await page.reload()
  await expect(page.locator('.garment-card').first()).toBeVisible()
  expect(await page.locator('.garment-card').count()).toBe(before)
})

test('exports a backup file the browser actually downloads', async ({ page }) => {
  await loadSampleArchive(page)
  await page.getByText('Backup & restore').click()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Export archive/i }).click(),
  ])

  expect(download.suggestedFilename()).toMatch(/^the-archive-\d{4}-\d{2}-\d{2}\.json$/)

  // Not just a file — a valid, versioned backup with the pieces in it.
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  expect(parsed.kind).toBe('fit-archive.archive')
  expect(parsed.schemaVersion).toBe(1)
  expect(Array.isArray(parsed.garments)).toBe(true)
  expect(parsed.garments.length).toBeGreaterThan(0)
})

test('refuses a stale second tab rather than overwriting the first', async ({
  context,
}) => {
  // Two real tabs on one origin — the multi-tab case unit tests can only
  // simulate. Both load empty, then A writes and B must be refused.
  const tabA = await context.newPage()
  const tabB = await context.newPage()

  // Both tabs must load BEFORE either writes, or B is not actually stale.
  await tabA.goto('/')
  await tabB.goto('/')
  await expect(tabA.getByText('Your archive is empty')).toBeVisible()
  await expect(tabB.getByText('Your archive is empty')).toBeVisible()

  // A archives the sample set and moves the stored revision on.
  await tabA.getByRole('button', { name: /Load sample/i }).first().click()
  await expect(tabA.locator('.storage-badge')).toContainText(/Saved locally/)

  // B still holds its own empty view. Its write must be refused, not applied.
  await tabB.getByRole('button', { name: /Load sample/i }).first().click()
  await expect(tabB.locator('.storage-badge')).toContainText(/Save failed/)

  // ...and B is TOLD, in words, with the action that fixes it. A refusal the
  // user never sees is a refusal that looks like a bug.
  const banner = tabB.locator('.archive-alert')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText(/another tab/i)
  await expect(banner.getByRole('button', { name: /Reload/i })).toBeVisible()

  // Nothing about the warning may push the layout sideways.
  const overflow = await tabB.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)

  // Reloading B is the documented recovery: it picks up A's archive and the
  // warning goes away.
  await banner.getByRole('button', { name: /Reload/i }).click()
  await expect(tabB.locator('.garment-card').first()).toBeVisible()
  await expect(tabB.locator('.archive-alert')).toHaveCount(0)

  // A's pieces survive — the whole point.
  await tabA.reload()
  await expect(tabA.locator('.garment-card').first()).toBeVisible()
  expect(await tabA.locator('.garment-card').count()).toBeGreaterThan(0)
})

test('hides the experimental 3D lab in a default build', async ({ page }) => {
  // The core/experimental boundary, checked in the artifact a visitor gets.
  // (The enabled path needs a rebuilt bundle AND the Python service, so it is
  // covered by unit tests instead.)
  await page.goto('/')
  await expect(page.getByText('Your archive is empty')).toBeVisible()
  // Neither the old label nor the new one appears in the shipped bundle's
  // navigation. (The phone's More sheet is closed here; that the sheet itself
  // withholds the lab is covered by MobileBottomNav.test.tsx.)
  await expect(page.getByRole('button', { name: /Proxy 3D/ })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: /Experimental 3D/ }),
  ).toHaveCount(0)

  // three.js must not be in the default session at all.
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  await goToView(page, 'Studio')
  await expect(page.getByText('Clothing Rack')).toBeVisible()
  expect(requests.filter((u) => /three/i.test(u))).toHaveLength(0)
})

test('stays usable on a narrow viewport', async ({ page }) => {
  await loadSampleArchive(page)
  await expect(page.locator('.garment-card').first()).toBeVisible()

  // Nothing should overflow the viewport horizontally.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
})

test('no view scrolls sideways at 390px', async ({ page }) => {
  // The document-level check above passes even when the SCROLL CONTAINER
  // (`.view`) is the thing overflowing — which is what was actually happening:
  // the Lookbook grid asked for a 340px track inside a 290px column, and the
  // Mirror's `1fr` track took its minimum from its content and came out 55px
  // too wide. Both scrolled sideways; neither showed up at the document level.
  // So every view is checked, on its own container.
  await page.setViewportSize({ width: 390, height: 844 })
  await loadSampleArchive(page)

  for (const view of [
    'Studio',
    'Closet',
    'Lookbook',
    'Fit Preview',
    'Outfits',
  ]) {
    await goToView(page, view)
    await expect(page.locator('.view')).toBeVisible()
    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.view') as HTMLElement
      return el.scrollWidth - el.clientWidth
    })
    expect(overflow, `${view} scrolls sideways at 390px`).toBeLessThanOrEqual(1)
  }
})

test('lays the studio room out without clipping its alcoves', async ({
  page,
}) => {
  // The Studio is no longer the landing view (the Closet is), but it is still
  // reachable and still restacks. It used to arrive broken: the room is a
  // fixed-height stage on
  // desktop, and restacking five alcoves into one or two columns needed more
  // height than the stage had. `overflow: hidden` turned the shortfall into
  // alcoves drawn over each other with their labels sliced in half.
  //
  // Bounding boxes did not catch it — the grid cells never overlapped, their
  // CONTENT spilled out. So the assertion is content-vs-box, per alcove, which
  // is the thing that was actually wrong.
  // Populated once: the pieces persist, and "Load sample" disappears with them.
  await loadSampleArchive(page)

  for (const [width, height] of [
    [1440, 900],
    [800, 1000],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height })
    await page.reload()
    // A reload lands on the Closet now, so the room has to be re-entered.
    await goToView(page, 'Studio')
    await expect(page.locator('.zone--rack')).toBeVisible()
    // Let the grid settle after the resize before measuring.
    await expect(page.locator('.rack__item').first()).toBeVisible()

    const clipped = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.zone'))
        .map((el) => ({
          zone: (el as HTMLElement).className,
          clippedBy: el.scrollHeight - el.clientHeight,
        }))
        // A couple of pixels is sub-pixel rounding, not a broken layout.
        .filter((z) => z.clippedBy > 2),
    )
    expect(clipped, `alcoves clipped at ${width}px`).toEqual([])

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1)
  }
})

test('swaps the sidebar for a bottom bar on a phone', async ({ page }) => {
  // The Phase 1 promise, checked where CSS actually applies: exactly one
  // persistent navigation at a time, and never two stacked bottom bars.
  await page.setViewportSize({ width: 390, height: 844 })
  await loadSampleArchive(page)

  await expect(page.locator('.mobilenav')).toBeVisible()
  await expect(page.locator('.sidebar')).toBeHidden()
  await expect(page.locator('.filmstrip')).toBeHidden()

  // Add is reachable without opening anything, and it opens the upload flow.
  await page.locator('.mobilenav').getByRole('button', { name: 'Add a piece' }).click()
  await expect(page.getByText('Drop a clothing photo')).toBeVisible()
  await page.getByRole('button', { name: /Close|Cancel|Discard/ }).first().click()

  // The bar must not cover the last row of the closet grid.
  await expect(page.locator('.garment-card').first()).toBeVisible()
  const covered = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.garment-card'))
    const last = cards[cards.length - 1]?.getBoundingClientRect()
    const bar = document.querySelector('.mobilenav')?.getBoundingClientRect()
    if (!last || !bar) return 0
    const view = document.querySelector('.view') as HTMLElement
    // Scroll to the end, then measure the last card against the bar.
    view.scrollTop = view.scrollHeight
    const after = cards[cards.length - 1].getBoundingClientRect()
    return after.bottom - bar.top
  })
  expect(covered, 'the bottom bar covers the last closet row').toBeLessThanOrEqual(1)
})

test('keeps the desktop sidebar and rail on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await loadSampleArchive(page)

  await expect(page.locator('.sidebar')).toBeVisible()
  await expect(page.locator('.filmstrip')).toBeVisible()
  await expect(page.locator('.mobilenav')).toBeHidden()
})
