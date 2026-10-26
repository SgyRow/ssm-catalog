/** A4 width at 96 dpi (210 mm). Fallback when docx-preview omits page width. */
export const DOCX_DEFAULT_PAGE_WIDTH_PX = 793.7

const PT_TO_PX = 96 / 72

export function parseCssLengthPx(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  if (trimmed === "auto" || trimmed.endsWith("%")) {
    return null
  }
  const match = trimmed.match(/^([\d.]+)\s*(px|pt|cm|in|mm)?$/i)
  if (!match) {
    return null
  }
  const amount = parseFloat(match[1])
  if (!Number.isFinite(amount) || amount <= 0) {
    return null
  }
  const unit = (match[2] || "px").toLowerCase()
  switch (unit) {
    case "pt":
      return amount * PT_TO_PX
    case "cm":
      return (amount * 96) / 2.54
    case "in":
      return amount * 96
    case "mm":
      return (amount * 96) / 25.4
    default:
      return amount
  }
}

function readSectionWidthPx(section: HTMLElement): number {
  for (const source of [
    section.style.width,
    section.style.minWidth,
    section.getAttribute("style")?.match(/width:\s*([^;]+)/)?.[1]
  ]) {
    const px = parseCssLengthPx(source)
    if (px && px >= 200 && px <= 2000) {
      return Math.round(px * 100) / 100
    }
  }

  const rectW = section.getBoundingClientRect().width
  if (rectW >= 200 && rectW <= 2000) {
    return Math.round(rectW * 100) / 100
  }

  return DOCX_DEFAULT_PAGE_WIDTH_PX
}

function readMantineCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") {
    return fallback
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return value || fallback
}

/** Mirror Mantine theme tokens into the isolated iframe document. */
export function syncMantineThemeToIframe(doc: Document): void {
  if (typeof document === "undefined") {
    return
  }
  const source = getComputedStyle(document.documentElement)
  const target = doc.documentElement
  for (let i = 0; i < source.length; i++) {
    const name = source[i]
    if (name.startsWith("--mantine-")) {
      target.style.setProperty(name, source.getPropertyValue(name))
    }
  }
  const colorScheme = document.documentElement.getAttribute("data-mantine-color-scheme")
  if (colorScheme) {
    target.setAttribute("data-mantine-color-scheme", colorScheme)
  }
  const accessibility = document.documentElement.getAttribute("data-accessibility")
  if (accessibility) {
    target.setAttribute("data-accessibility", accessibility)
  }
}

/** Base stylesheet injected into the isolated docx iframe before render. */
export function docxViewerBaseCss(className: string): string {
  const c = className
  const textColor = readMantineCssVar("--mantine-color-dark-8", "#141517")

  return `
html, body {
  margin: 0;
  padding: 0;
  background: transparent;
  font-family: "Calibri", "Segoe UI", "Times New Roman", serif;
  font-size: 16px;
  line-height: normal;
  color: ${textColor};
}
.${c}-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: max-content;
  max-width: none;
  margin: 0 auto;
  padding: 0;
  box-sizing: border-box;
  background: transparent;
  transform-origin: top center;
}
.${c}-wrapper > section.${c} {
  flex-shrink: 0;
  margin-bottom: var(--docx-page-gap, 1rem);
  background: light-dark(
    var(--mantine-color-gray-0),
    var(--mantine-color-dark-6)
  );
  border: 1px solid light-dark(
    var(--mantine-color-gray-3),
    var(--mantine-color-dark-4)
  );
  border-radius: var(--docx-page-radius, 4px);
  box-shadow: none;
  box-sizing: border-box;
  overflow: hidden;
  position: relative;
}
section.${c} {
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
}
.${c} p {
  margin: 0;
  min-height: 1em;
}
.${c} span {
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
.${c} table {
  border-collapse: collapse;
}
.${c} table td,
.${c} table th {
  vertical-align: top;
}
.${c} a {
  color: inherit;
  text-decoration: inherit;
}
`
}

/**
 * Lock each page section to a fixed pixel width and keep the wrapper shrink-wrapped.
 * Returns page `<section>` roots in document order.
 */
export function normalizeDocxPageLayout(
  root: Document | ParentNode,
  className: string
): HTMLElement[] {
  const sections = Array.from(
    root.querySelectorAll<HTMLElement>(`section.${className}`)
  )

  sections.forEach(section => {
    const widthPx = readSectionWidthPx(section)
    section.style.width = `${widthPx}px`
    section.style.minWidth = `${widthPx}px`
    section.style.maxWidth = `${widthPx}px`
    section.style.flexShrink = "0"
    section.style.boxSizing = "border-box"
  })

  const wrapper = root.querySelector<HTMLElement>(`.${className}-wrapper`)
  if (wrapper) {
    wrapper.style.width = "max-content"
    wrapper.style.maxWidth = "none"
    wrapper.style.marginLeft = "auto"
    wrapper.style.marginRight = "auto"
  }

  return sections
}

function shouldOpenHyperlinkInNewTab(href: string): boolean {
  const trimmed = href.trim()
  if (!trimmed || trimmed.startsWith("#")) {
    return false
  }
  return /^(https?:|mailto:|tel:)/i.test(trimmed)
}

/** External hyperlinks open in a new tab instead of navigating the preview iframe. */
export function configureDocxHyperlinks(root: Document | ParentNode): void {
  root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach(anchor => {
    const href = anchor.getAttribute("href") ?? ""
    if (!shouldOpenHyperlinkInNewTab(href)) {
      return
    }
    anchor.target = "_blank"
    anchor.rel = "noopener noreferrer"
  })
}

export function applyDocxZoom(
  iframe: HTMLIFrameElement,
  className: string,
  zoomFactor: number
): void {
  const doc = iframe.contentDocument
  if (!doc) {
    return
  }

  const scale = Math.max(0.25, zoomFactor / 100)
  const wrapper = doc.querySelector<HTMLElement>(`.${className}-wrapper`)
  if (wrapper) {
    wrapper.style.zoom = String(scale)
    wrapper.style.transformOrigin = "top center"
  }

  resizeDocxIframeToContent(iframe, scale)
}

export function resizeDocxIframeToContent(
  iframe: HTMLIFrameElement,
  zoomScale = 1
): void {
  const doc = iframe.contentDocument
  if (!doc) {
    return
  }
  const height = Math.max(
    doc.documentElement.scrollHeight,
    doc.body.scrollHeight,
    320
  )
  iframe.style.height = `${Math.ceil(height * zoomScale)}px`
}
