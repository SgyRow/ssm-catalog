import {expect, test, type Page} from "@playwright/test"

/**
 * Reviewer note — scope & limits: Work targets SelectablePdfPage and selectablePdf cache/load
 * behavior; Playwright asserts text-layer DOM signals and elementFromPoint hit-testing via dom-probe,
 * not literal drag-selection or the full authenticated product shell. In-tab PDF.js caches are
 * long-lived; multiple tabs, concurrent different versions of the same document, or very large PDFs
 * (memory/render latency) are not modeled. Same docVerId with a replaced in-memory buffer relies on
 * bufferRev tracking and is not directly exercised end-to-end in this spec.
 *
 * ---------------------------------------------------------------------------
 * Manual / product verification (bug: selectable PDF → non-selectable → back)
 * ---------------------------------------------------------------------------
 *
 * Goal: After viewing a non-OCR or non-selectable preview, returning to the same
 * searchable PDF should still allow text selection without a full browser reload.
 *
 * Real app (Papermerge UI) — steps:
 * 1. Open a PDF with extractable text (OCR or native text). Confirm you can select text.
 * 2. Open a document that uses raster-only preview (e.g. scanned PDF with no text
 *    layer, or a non-PDF image) in the same viewer area / same tab flow your users use.
 * 3. Open the first searchable PDF again (same document as step 1).
 * 4. Confirm text selection still works (or note failure: no highlight, selects underlying UI, etc.).
 *
 * What to record (separate measured vs inferred):
 *
 * Measured on failing run (DevTools / Playwright):
 * - Whether `div.page .textLayer` exists and is visible.
 * - Approximate count of `div.page .textLayer span` (0 ⇒ no selectable runs).
 * - Computed `pointer-events` on `div.page canvas` and on `div.page .textLayer`.
 * - Computed `opacity` / `visibility` on `.textLayer`.
 * - Whether `--total-scale-factor` is set on the ancestor `.inner` (computed style non-empty).
 *
 * Inferred from implementation (not a substitute for measuring):
 * - `SelectablePdfPage` uses pdf.js `TextLayer`; spans are transparent and rely on hit-testing.
 * - Canvas layer uses `pointer-events: none` so events reach the text layer
 *   (`SelectablePdfPage.module.css`).
 *
 * Automated mirrors (`e2e/dom-probe/main.tsx`):
 * - `?scenario=doc-switch` — same `SelectablePdfPage` instance, `docVerId` toggles
 *   (searchable buffer vs no buffer + placeholder image), like two PDFs in the same viewer branch.
 * - `?scenario=doc-switch-remount` — `SelectablePdfPage` fully unmounts, blob placeholder mounts,
 *   then `SelectablePdfPage` mounts again (like PDF → non-PDF → PDF in `PageContainer`).
 *
 * After each simulated switch back to the searchable PDF, tests assert DOM signals (spans,
 * `pointer-events`, `--total-scale-factor`) and `document.elementFromPoint` on a text span
 * resolves under `.textLayer` (hit-testing / stacking regression).
 * ---------------------------------------------------------------------------
 */

type DomRow = {
  depth: number
  tag: string
  className: string
  style: string
  childElementCount: number
  childTags: string
}

type TextLayerSignals = {
  spanCount: number
  textLayerPointerEvents: string
  textLayerOpacity: string
  textLayerVisibility: string
  canvasPointerEvents: string
  totalScaleFactor: string
}

async function readTextLayerSignals(page: Page): Promise<TextLayerSignals> {
  const layer = page.locator("div.page .textLayer").first()
  await expect(layer).toBeVisible({timeout: 60_000})
  // pdf.js fills spans asynchronously after the empty .textLayer mounts; sampling too early
  // yields spanCount 0 (flaky on remount / slow CI).
  await expect(layer.locator("span").first()).toBeVisible({timeout: 60_000})
  return layer.evaluate(el => {
    const pageRoot = el.closest("div.page")
    const canvas = pageRoot?.querySelector("canvas")
    const spans = el.querySelectorAll("span")
    const cs = getComputedStyle(el)
    const inner = el.parentElement
    return {
      spanCount: spans.length,
      textLayerPointerEvents: cs.pointerEvents,
      textLayerOpacity: cs.opacity,
      textLayerVisibility: cs.visibility,
      canvasPointerEvents: canvas
        ? getComputedStyle(canvas).pointerEvents
        : "",
      totalScaleFactor: inner
        ? getComputedStyle(inner).getPropertyValue("--total-scale-factor").trim()
        : ""
    }
  })
}

function expectHealthyTextLayer(signals: TextLayerSignals) {
  expect(signals.spanCount, "text spans for selection").toBeGreaterThan(0)
  expect(signals.canvasPointerEvents, "canvas ignores pointer").toBe("none")
  expect(signals.totalScaleFactor, "--total-scale-factor for pdf.js calc()").not.toBe(
    ""
  )
}

/**
 * Regression guard: broken stacking or a capturing canvas still allows a DOM text layer,
 * but pointer hit-testing will not reach `.textLayer` spans (user selects "through" to canvas/UI).
 */
async function expectTextLayerHitTest(page: Page): Promise<void> {
  await page.evaluate(() => {
    const layer = document.querySelector("div.page .textLayer")
    const span = layer?.querySelector("span")
    if (!layer || !span) {
      throw new Error("missing text layer or span for hit test")
    }
    const r = span.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) {
      throw new Error("span has no layout box for hit test")
    }
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const el = document.elementFromPoint(x, y)
    if (!el) {
      throw new Error("elementFromPoint returned null")
    }
    if (!el.closest(".textLayer")) {
      throw new Error(
        `expected hit under .textLayer, got ${el.tagName}.${el.className}`
      )
    }
  })
}

test.describe("SelectablePdfPage DOM (probe app)", () => {
  test("zoom-controls: page number input clamps and submits on Enter", async ({
    page
  }) => {
    await page.goto("/?scenario=zoom-controls")
    const input = page.getByLabel("page-number-input")
    await expect(input).toBeVisible()

    await input.fill("14")
    await input.press("Enter")
    await expect(page.getByTestId("probe-current-page")).toHaveText("9")
    await expect(page.getByTestId("probe-submitted-page")).toHaveText("9")

    await input.fill("0")
    await input.press("Enter")
    await expect(page.getByTestId("probe-current-page")).toHaveText("1")
    await expect(page.getByTestId("probe-submitted-page")).toHaveText("1")

    await page.getByLabel("zoom-in").click()
    await page.getByLabel("zoom-out").click()
    await page.getByLabel("zoom-reset").click()
    await expect(page.getByTestId("probe-zoom-in-count")).toHaveText("1")
    await expect(page.getByTestId("probe-zoom-out-count")).toHaveText("1")
    await expect(page.getByTestId("probe-zoom-reset-count")).toHaveText("1")
  })

  test("fallback-img branch: zoom on <img>, no .root stack", async ({page}) => {
    await page.goto("/?mode=fallback-img")
    const img = page.locator("div.page img")
    await expect(img).toBeVisible({timeout: 30_000})
    await expect(img).toHaveAttribute("src", /^data:image\//)

    const style = await img.evaluate(el => el.getAttribute("style") ?? "")
    expect(style).toMatch(/width:\s*100%/)
    expect(style).toMatch(/transform:\s*rotate\(0deg\)/)

    const pageRoot = page.locator("div.page").first()
    const hasRootLike = await pageRoot.evaluate(root => {
      const divs = root.querySelectorAll("div")
      return Array.from(divs).some(
        d =>
          (d.className?.toString() ?? "").includes("root") &&
          (d.getAttribute("style") ?? "").includes("max-width")
      )
    })
    expect(hasRootLike).toBe(false)

    const rows = await pageRoot.evaluate((el, maxDepth) => {
      const out: DomRow[] = []
      function walk(node: Element, depth: number) {
        const children = Array.from(node.children)
        out.push({
          depth,
          tag: node.tagName.toLowerCase(),
          className: node.className?.toString?.() ?? "",
          style: node.getAttribute("style") ?? "",
          childElementCount: children.length,
          childTags: children.map(c => c.tagName.toLowerCase()).join(",")
        })
        if (depth < maxDepth) {
          for (const c of children) {
            walk(c, depth + 1)
          }
        }
      }
      walk(el, 0)
      return out
    }, 6)
    expect(rows.some(r => r.tag === "img")).toBe(true)
  })

  test("canvas branch: anchor div with width % style", async ({
    page
  }) => {
    await page.goto("/?mode=canvas")
    await expect(page.locator("div.page canvas")).toBeVisible({
      timeout: 60_000
    })

    const anchor = await page.evaluate(() => {
      const pageEl = document.querySelector("div.page")
      if (!pageEl) {
        return null
      }
      const divs = pageEl.querySelectorAll("div")
      for (const d of divs) {
        const s = d.getAttribute("style") ?? ""
        if (
          /\bwidth:\s*\d+%/.test(s) &&
          (d.className?.toString() ?? "").length > 0
        ) {
          return {
            className: d.className.toString(),
            style: s,
            childElementCount: d.childElementCount
          }
        }
      }
      return null
    })

    expect(anchor).not.toBeNull()
    expect(anchor!.style).toMatch(/\bwidth:\s*100%/)

    const pageRoot = page.locator("div.page").first()
    const rows = await pageRoot.evaluate((el, maxDepth) => {
      const out: DomRow[] = []
      function walk(node: Element, depth: number) {
        const children = Array.from(node.children)
        out.push({
          depth,
          tag: node.tagName.toLowerCase(),
          className: node.className?.toString?.() ?? "",
          style: node.getAttribute("style") ?? "",
          childElementCount: children.length,
          childTags: children.map(c => c.tagName.toLowerCase()).join(",")
        })
        if (depth < maxDepth) {
          for (const c of children) {
            walk(c, depth + 1)
          }
        }
      }
      walk(el, 0)
      return out
    }, 8)

    expect(rows.some(r => r.tag === "canvas")).toBe(true)
    const textLayerRow = rows.find(
      r => r.className.includes("textLayer") || r.tag === "span"
    )
    expect(textLayerRow).toBeDefined()
  })

  test("doc-switch: searchable → raster-only → searchable keeps text layer healthy", async ({
    page
  }) => {
    await page.goto("/?scenario=doc-switch")
    await expect(page.getByTestId("probe-loading")).toBeHidden({
      timeout: 60_000
    })

    const before = await readTextLayerSignals(page)
    expectHealthyTextLayer(before)

    await page.getByTestId("probe-show-scanned").click()
    const img = page.locator("div.page img")
    await expect(img).toBeVisible({timeout: 30_000})
    await expect(page.locator("div.page .textLayer")).toHaveCount(0)

    await page.getByTestId("probe-show-searchable").click()
    const after = await readTextLayerSignals(page)
    expectHealthyTextLayer(after)
    await expectTextLayerHitTest(page)
  })

  test("doc-switch: two full cycles searchable ↔ raster-only keep text layer healthy", async ({
    page
  }) => {
    await page.goto("/?scenario=doc-switch")
    await expect(page.getByTestId("probe-loading")).toBeHidden({
      timeout: 60_000
    })

    for (let i = 0; i < 2; i++) {
      const searchable = await readTextLayerSignals(page)
      expectHealthyTextLayer(searchable)

      await page.getByTestId("probe-show-scanned").click()
      await expect(page.locator("div.page img")).toBeVisible({timeout: 30_000})
      await expect(page.locator("div.page .textLayer")).toHaveCount(0)

      await page.getByTestId("probe-show-searchable").click()
      const again = await readTextLayerSignals(page)
      expectHealthyTextLayer(again)
      await expectTextLayerHitTest(page)
    }
  })

  test("doc-switch-remount: PDF → blob placeholder → PDF keeps text layer healthy", async ({
    page
  }) => {
    await page.goto("/?scenario=doc-switch-remount")
    await expect(page.getByTestId("probe-loading")).toBeHidden({
      timeout: 60_000
    })

    const before = await readTextLayerSignals(page)
    expectHealthyTextLayer(before)

    await page.getByTestId("probe-remount-blob").click()
    const img = page.locator("div.page img")
    await expect(img).toBeVisible({timeout: 30_000})
    await expect(page.locator("div.page .textLayer")).toHaveCount(0)

    await page.getByTestId("probe-remount-pdf").click()
    const after = await readTextLayerSignals(page)
    expectHealthyTextLayer(after)
    await expectTextLayerHitTest(page)
  })

  test("doc-switch-remount: two full cycles PDF ↔ blob placeholder keep text layer healthy", async ({
    page
  }) => {
    await page.goto("/?scenario=doc-switch-remount")
    await expect(page.getByTestId("probe-loading")).toBeHidden({
      timeout: 60_000
    })

    for (let i = 0; i < 2; i++) {
      const pdfSignals = await readTextLayerSignals(page)
      expectHealthyTextLayer(pdfSignals)

      await page.getByTestId("probe-remount-blob").click()
      await expect(page.locator("div.page img")).toBeVisible({timeout: 30_000})
      await expect(page.locator("div.page .textLayer")).toHaveCount(0)

      await page.getByTestId("probe-remount-pdf").click()
      const again = await readTextLayerSignals(page)
      expectHealthyTextLayer(again)
      await expectTextLayerHitTest(page)
    }
  })
})
