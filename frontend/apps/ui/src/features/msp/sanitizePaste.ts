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

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  A: new Set(["href", "target", "rel", "title"]),
  IMG: new Set(["src", "alt", "width", "height"]),
  TD: new Set(["colspan", "rowspan", "width", "height", "align", "valign"]),
  TH: new Set(["colspan", "rowspan", "width", "height", "align", "valign"]),
  TABLE: new Set(["border", "cellpadding", "cellspacing", "width", "align"]),
  COL: new Set(["span", "width"]),
  OL: new Set(["start", "type"]),
  FONT: new Set(["color", "size", "face"]),
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
  "line-height"
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
