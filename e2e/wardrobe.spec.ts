import { test, expect, type Page } from '@playwright/test'

// The sample archive is the only way to get real garments into the app without
// a canvas-driven upload, which is exactly the kind of brittleness this suite
// is meant to avoid.
async function loadSampleArchive(page: Page) {
  await page.goto('/')
  await expect(page.getByText('Clothing Rack')).toBeVisible()
  await page.getByRole('button', { name: /Load sample/i }).first().click()
  await expect(page.getByText('Your studio is empty')).toBeHidden()
}

test('archives the sample wardrobe and shows it in the closet', async ({ page }) => {
  await loadSampleArchive(page)

  await page.getByRole('button', { name: /^Closet/ }).click()
  const cards = page.locator('.garment-card')
  await expect(cards.first()).toBeVisible()
  expect(await cards.count()).toBeGreaterThan(0)
})

test('persists the archive across a real reload', async ({ page }) => {
  // The behaviour jsdom cannot prove: IndexedDB surviving a genuine navigation.
  await loadSampleArchive(page)
  await page.getByRole('button', { name: /^Closet/ }).click()
  const before = await page.locator('.garment-card').count()
  expect(before).toBeGreaterThan(0)

  await page.reload()
  await page.getByRole('button', { name: /^Closet/ }).click()
  await expect(page.locator('.garment-card').first()).toBeVisible()
  expect(await page.locator('.garment-card').count()).toBe(before)
})

test('exports a backup file the browser actually downloads', async ({ page }) => {
  await loadSampleArchive(page)
  await page.getByRole('button', { name: /^Closet/ }).click()
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
  await expect(tabA.getByText('Clothing Rack')).toBeVisible()
  await expect(tabB.getByText('Clothing Rack')).toBeVisible()

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
  await expect(tabB.getByText('Clothing Rack')).toBeVisible()
  await expect(tabB.locator('.archive-alert')).toHaveCount(0)

  // A's pieces survive — the whole point.
  await tabA.reload()
  await tabA.getByRole('button', { name: /^Closet/ }).click()
  await expect(tabA.locator('.garment-card').first()).toBeVisible()
  expect(await tabA.locator('.garment-card').count()).toBeGreaterThan(0)
})

test('hides the experimental 3D lab in a default build', async ({ page }) => {
  // The core/experimental boundary, checked in the artifact a visitor gets.
  // (The enabled path needs a rebuilt bundle AND the Python service, so it is
  // covered by unit tests instead.)
  await page.goto('/')
  await expect(page.getByText('Clothing Rack')).toBeVisible()
  await expect(page.getByRole('button', { name: /Proxy 3D/ })).toHaveCount(0)

  // three.js must not be in the default session at all.
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  await page.getByRole('button', { name: /^Closet/ }).click()
  expect(requests.filter((u) => /three/i.test(u))).toHaveLength(0)
})

test('stays usable on a narrow viewport', async ({ page }) => {
  await loadSampleArchive(page)
  await page.getByRole('button', { name: /^Closet/ }).click()
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

  for (const view of ['Studio', 'Closet', 'Lookbook', 'Mirror', 'Outfits']) {
    await page.getByRole('button', { name: new RegExp(`^${view}`) }).click()
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
  // The Studio is the landing view, so a phone visitor's FIRST impression is
  // this scene. It used to arrive broken: the room is a fixed-height stage on
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
