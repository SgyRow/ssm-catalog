const ALLOWED_TAGS = new Set([
  "P",
  "BR",
  "DIV",
  "SPAN",
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "S",
  "STRIKE",
  "DEL",
  "INS",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "UL",
  "OL",
  "LI",
  "TABLE",
  "THEAD",
  "TBODY",
  "TFOOT",
  "TR",
  "TH",
  "TD",
  "CAPTION",
  "COLGROUP",
  "COL",
  "IMG",
  "A",
  "BLOCKQUOTE",
  "PRE",
  "CODE",
  "SUB",
  "SUP",
  "HR",
  "FONT"
])

const BLOCK_ALIGN = new Set(["align", "dir"])

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  A: new Set(["href", "target", "rel", "title"]),
  IMG: new Set(["src", "alt", "width", "height"]),
  TD: new Set(["colspan", "rowspan", "width", "height", "align", "valign"]),
  TH: new Set(["colspan", "rowspan", "width", "height", "align", "valign"]),
  TABLE: new Set(["border", "cellpadding", "cellspacing", "width", "align"]),
  COL: new Set(["span", "width"]),
  OL: new Set(["start", "type"]),
  UL: new Set(["type"]),
  FONT: new Set(["color", "size", "face"]),
  P: BLOCK_ALIGN,
  DIV: BLOCK_ALIGN,
  H1: BLOCK_ALIGN,
  H2: BLOCK_ALIGN,
  H3: BLOCK_ALIGN,
  H4: BLOCK_ALIGN,
  H5: BLOCK_ALIGN,
  H6: BLOCK_ALIGN,
  BLOCKQUOTE: BLOCK_ALIGN,
  "*": new Set(["style"])
}

const STYLE_PROPS = new Set([
  "color",
  "background",
  "background-color",
  "font-weight",
  "font-style",
  "font-size",
  "font-family",
  "text-align",
  "text-decoration",
  "text-decoration-line",
  "text-indent",
  "vertical-align",
  "width",
  "height",
  "min-width",
  "max-width",
  "border",
  "border-collapse",
  "border-color",
  "border-style",
  "border-width",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "white-space",
  "line-height",
  "list-style-type",
  "list-style"
])

const SAFE_HREF = /^(https?:|mailto:|#)/i
const SAFE_IMG = /^(data:image\/(png|jpe?g|gif|webp|bmp);base64,|https?:)/i

function cleanStyle(value: string): string {
  return value
    .split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const idx = part.indexOf(":")
      if (idx < 0) {
        return ""
      }
      const name = part.slice(0, idx).trim().toLowerCase()
      const val = part.slice(idx + 1).trim()
      if (!STYLE_PROPS.has(name)) {
        return ""
      }
      if (/expression|javascript:|url\s*\(\s*['"]?\s*javascript/i.test(val)) {
        return ""
      }
      // Word/HTML paste often uses a negative offset and the table
      // (or its wrapper) slides off the left edge of the article.
      if (isNegativeOffset(name, val)) {
        return ""
      }
      return `${name}: ${val}`
    })
    .filter(Boolean)
    .join("; ")
}

function copyAllowedAttrs(src: Element, dest: Element) {
  const tag = dest.tagName
  const allowed = new Set([
    ...(ALLOWED_ATTRS[tag] ?? []),
    ...ALLOWED_ATTRS["*"]
  ])
  for (const attr of Array.from(src.attributes)) {
    const name = attr.name.toLowerCase()
    if (name.startsWith("on") || name === "class" || name.startsWith("xmlns")) {
      continue
    }
    if (!allowed.has(name)) {
      continue
    }
    let value = attr.value
    if (name === "style") {
      value = cleanStyle(value)
      if (!value) {
        continue
      }
    }
    if (name === "href" && !SAFE_HREF.test(value)) {
      continue
    }
    if (name === "src" && !SAFE_IMG.test(value)) {
      continue
    }
    dest.setAttribute(name, value)
  }
}

function walk(node: Node, dest: ParentNode) {
  if (node.nodeType === Node.TEXT_NODE) {
    dest.appendChild(document.createTextNode(node.textContent || ""))
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return
  }
  const el = node as Element
  const tag = el.tagName
  if (tag === "SCRIPT" || tag === "STYLE" || tag === "META" || tag === "LINK") {
    return
  }
  if (tag === "O:P" || tag.startsWith("W:") || tag.startsWith("V:")) {
    for (const child of Array.from(el.childNodes)) {
      walk(child, dest)
    }
    return
  }
  if (!ALLOWED_TAGS.has(tag)) {
    for (const child of Array.from(el.childNodes)) {
      walk(child, dest)
    }
    return
  }
  const next = document.createElement(tag.toLowerCase())
  copyAllowedAttrs(el, next)
  for (const child of Array.from(el.childNodes)) {
    walk(child, next)
  }
  dest.appendChild(next)
}

const OFFSET_PROPS = [
  "margin",
  "margin-left",
  "margin-right",
  "margin-top",
  "margin-bottom",
  "left",
  "right",
  "top",
  "bottom",
  "text-indent"
]

function isNegativeOffset(name: string, value: string): boolean {
  if (!OFFSET_PROPS.includes(name)) {
    return false
  }
  return /(^|\s)-(?=\d|\.)/.test(value)
}

function parseMarginLeft(el: HTMLElement): number {
  const raw = el.style.marginLeft
  if (!raw) {
    return 0
  }
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : 0
}

/**
 * Browser indent wraps a block in a quote whose style is only a left margin
 * (Chrome also sets border:none and padding:0). The quote command stores no style.
 */
function isBrowserIndentQuote(el: HTMLElement): boolean {
  if (el.tagName !== "BLOCKQUOTE") {
    return false
  }
  const compact = (el.getAttribute("style") || "")
    .toLowerCase()
    .replace(/\s+/g, "")
  if (!compact || !compact.includes("margin")) {
    return false
  }
  const stripped = compact
    .replace(/margin(-left|-right|-top|-bottom|-inline-start|-inline-end)?:[^;]*;?/g, "")
    .replace(/margin:[^;]*;?/g, "")
    .replace(/border(-left|-right|-top|-bottom|-color|-style|-width)?:[^;]*;?/g, "")
    .replace(/border:[^;]*;?/g, "")
    .replace(/padding(-left|-right|-top|-bottom)?:[^;]*;?/g, "")
    .replace(/padding:[^;]*;?/g, "")
  if (stripped.length > 0) {
    return false
  }
  if (parseMarginLeft(el) > 0) {
    return true
  }
  const left = compact.match(/margin-(?:left|inline-start):([\d.]+)/)
  if (left && parseFloat(left[1]) > 0) {
    return true
  }
  const shorthand = compact.match(/margin:([^;]+)/)
  if (!shorthand) {
    return false
  }
  const parts = shorthand[1].match(/-?[\d.]+[a-z%]*/g) || []
  const side =
    parts.length === 1 ? parts[0] : parts.length === 4 ? parts[3] : ""
  return !!side && parseFloat(side) > 0
}

const INDENT_TARGET = /^(P|DIV|H[1-6]|LI|PRE|BLOCKQUOTE|UL|OL|TABLE)$/

function addIndent(el: HTMLElement, extra: number) {
  const next = Math.max(0, parseMarginLeft(el) + extra)
  if (next === 0) {
    el.style.removeProperty("margin-left")
  } else {
    el.style.marginLeft = `${Math.round(next)}px`
  }
  if (el.style.length === 0) {
    el.removeAttribute("style")
  }
}

function unwrapIndentQuote(quote: HTMLElement) {
  const extra = parseMarginLeft(quote) || 40
  const parent = quote.parentNode
  if (!parent) {
    return
  }
  const meaningful = Array.from(quote.childNodes).filter(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      return !!(node.textContent || "").replace(/\u00a0/g, " ").trim()
    }
    return node.nodeType === Node.ELEMENT_NODE
  })
  const allBlocks =
    meaningful.length > 0 &&
    meaningful.every(
      node => node instanceof HTMLElement && INDENT_TARGET.test(node.tagName)
    )
  if (allBlocks) {
    for (const node of Array.from(quote.childNodes)) {
      if (node instanceof HTMLElement && INDENT_TARGET.test(node.tagName)) {
        addIndent(node, extra)
      }
      parent.insertBefore(node, quote)
    }
  } else {
    const wrapper = document.createElement("div")
    addIndent(wrapper, extra)
    while (quote.firstChild) {
      wrapper.appendChild(quote.firstChild)
    }
    parent.insertBefore(wrapper, quote)
  }
  parent.removeChild(quote)
}

function clampNegativeOffsets(root: HTMLElement) {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>("*"))
  for (const el of nodes) {
    for (const prop of OFFSET_PROPS) {
      const value = el.style.getPropertyValue(prop)
      if (value && isNegativeOffset(prop, value)) {
        el.style.removeProperty(prop)
      }
    }
    if (
      (el.tagName === "TD" || el.tagName === "TH") &&
      /nowrap/i.test(el.style.whiteSpace)
    ) {
      el.style.whiteSpace = "normal"
    }
    if (el.style.length === 0) {
      el.removeAttribute("style")
    }
  }
}

/** Turn browser indent-quotes into margin and drop offsets that escape the page. */
export function normalizeRichRoot(root: HTMLElement) {
  for (let guard = 0; guard < 40; guard++) {
    const quotes = Array.from(root.querySelectorAll("blockquote"))
    let target: HTMLElement | null = null
    for (let i = quotes.length - 1; i >= 0; i--) {
      const el = quotes[i] as HTMLElement
      if (isBrowserIndentQuote(el)) {
        target = el
        break
      }
    }
    if (!target) {
      break
    }
    unwrapIndentQuote(target)
  }
  clampNegativeOffsets(root)
}

export function normalizeRichHtml(raw: string): string {
  const trimmed = raw || ""
  if (!trimmed.trim()) {
    return ""
  }
  const doc = new DOMParser().parseFromString(trimmed, "text/html")
  normalizeRichRoot(doc.body)
  return doc.body.innerHTML
}

export function sanitizePastedHtml(raw: string): string {
  const trimmed = (raw || "").replace(/<!--[\s\S]*?-->/g, "")
  if (!trimmed.trim()) {
    return ""
  }
  const doc = new DOMParser().parseFromString(trimmed, "text/html")
  const out = document.createElement("div")
  for (const child of Array.from(doc.body.childNodes)) {
    walk(child, out)
  }
  normalizeRichRoot(out)
  return out.innerHTML
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function clipboardImages(data: DataTransfer | null): File[] {
  if (!data) {
    return []
  }
  const files: File[] = []
  for (const item of Array.from(data.items || [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile()
      if (file) {
        files.push(file)
      }
    }
  }
  return files
}
