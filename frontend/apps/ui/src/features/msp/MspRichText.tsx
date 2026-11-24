import {ActionIcon, Group, Menu, Tooltip, UnstyledButton} from "@mantine/core"
import {
  IconAlignCenter,
  IconAlignJustified,
  IconAlignLeft,
  IconAlignRight,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBold,
  IconClearFormatting,
  IconH1,
  IconH2,
  IconH3,
  IconHighlight,
  IconIndentDecrease,
  IconIndentIncrease,
  IconItalic,
  IconLetterA,
  IconLink,
  IconLinkOff,
  IconList,
  IconListNumbers,
  IconPhoto,
  IconSeparator,
  IconStrikethrough,
  IconSubscript,
  IconSuperscript,
  IconUnderline,
  IconX
} from "@tabler/icons-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type ReactNode
} from "react"
import {useTranslation} from "react-i18next"

import {looksLikeHtml} from "./html"
import classes from "./MspView.module.css"
import {
  clipboardImages,
  fileToDataUrl,
  normalizeRichHtml,
  normalizeRichRoot,
  sanitizePastedHtml
} from "./sanitizePaste"

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const SAFE_IMG = /^(data:image\/(png|jpe?g|gif|webp|bmp);base64,|https?:)/i

const TEXT_COLORS = [
  "#000000",
  "#434343",
  "#666666",
  "#999999",
  "#c92a2a",
  "#e03131",
  "#e67700",
  "#f08c00",
  "#2b8a3e",
  "#37b24d",
  "#1864ab",
  "#1c7ed6",
  "#5f3dc4",
  "#7950f2",
  "#a61e4d",
  "#c2255c"
]

const HIGHLIGHT_COLORS = [
  "#fff3bf",
  "#ffec99",
  "#ffc9c9",
  "#ffa8a8",
  "#d3f9d8",
  "#b2f2bb",
  "#d0ebff",
  "#a5d8ff",
  "#e5dbff",
  "#d0bfff",
  "#ffd8a8",
  "#ffc078",
  "#e9ecef",
  "#ced4da",
  "#ffffff"
]

const CLEAR_HIGHLIGHT = "transparent"
const HIGHLIGHT_PROPS = ["background-color", "background"] as const
const COLOR_PROPS = ["color"] as const

function hasPaintStyle(
  el: HTMLElement,
  props: readonly string[]
): boolean {
  for (const prop of props) {
    const value = (el.style.getPropertyValue(prop) || "").trim().toLowerCase()
    if (
      value &&
      value !== "transparent" &&
      value !== "rgba(0, 0, 0, 0)" &&
      value !== "inherit" &&
      value !== "initial"
    ) {
      return true
    }
  }
  if (props.includes("color") && el.tagName === "FONT" && el.getAttribute("color")) {
    return true
  }
  return false
}

function unwrapElement(el: HTMLElement) {
  const parent = el.parentNode
  if (!parent) {
    return
  }
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el)
  }
  parent.removeChild(el)
}

function cleanupStyleShell(el: HTMLElement) {
  if (el.style.length === 0) {
    el.removeAttribute("style")
  }
  if (el.tagName === "FONT" && !el.getAttribute("color") && el.style.length === 0) {
    // keep face/size if present
    if (!el.getAttribute("face") && !el.getAttribute("size")) {
      unwrapElement(el)
    }
    return
  }
  if (
    (el.tagName === "SPAN" || el.tagName === "FONT") &&
    !el.getAttribute("style") &&
    el.attributes.length === 0
  ) {
    unwrapElement(el)
  }
}

function stripPaintFromTree(root: Node, props: readonly string[]) {
  if (root.nodeType !== Node.ELEMENT_NODE) {
    return
  }
  const el = root as HTMLElement
  for (const child of Array.from(el.childNodes)) {
    stripPaintFromTree(child, props)
  }
  for (const prop of props) {
    el.style.removeProperty(prop)
  }
  if (props.includes("color")) {
    el.removeAttribute("color")
  }
  cleanupStyleShell(el)
}

function splitAroundNode(element: HTMLElement, node: Node) {
  const parent = element.parentNode
  if (!parent || !element.contains(node)) {
    return
  }

  let pivot: Node = node
  while (pivot.parentNode && pivot.parentNode !== element) {
    pivot = pivot.parentNode
  }

  const right = element.cloneNode(false) as HTMLElement
  const following: Node[] = []
  let sibling = pivot.nextSibling
  while (sibling) {
    following.push(sibling)
    sibling = sibling.nextSibling
  }
  for (const item of following) {
    right.appendChild(item)
  }

  element.removeChild(pivot)
  parent.insertBefore(pivot, element.nextSibling)
  if (right.childNodes.length > 0) {
    parent.insertBefore(right, pivot.nextSibling)
  }
  if (!element.hasChildNodes()) {
    parent.removeChild(element)
  } else {
    cleanupStyleShell(element)
  }
  if (right.parentNode && !right.hasChildNodes()) {
    right.parentNode.removeChild(right)
  } else if (right.parentNode) {
    cleanupStyleShell(right)
  }
}

function findPaintedAncestor(
  marker: HTMLElement,
  editor: HTMLElement,
  props: readonly string[]
): HTMLElement | null {
  let styled: HTMLElement | null = null
  let node: HTMLElement | null = marker.parentElement
  while (node && node !== editor) {
    if (hasPaintStyle(node, props)) {
      styled = node
    }
    node = node.parentElement
  }
  return styled
}

const BLOCK_STOP =
  /^(P|DIV|H[1-6]|LI|PRE|BLOCKQUOTE|TD|TH|TR|TABLE|TBODY|THEAD|TFOOT|UL|OL)$/

function liftOutOfPaint(
  editor: HTMLElement,
  marker: HTMLElement,
  props: readonly string[]
) {
  // Split inline wrappers only. Splitting a paragraph here inserts a
  // visible line break, which is what the color buttons used to do.
  for (let guard = 0; guard < 32; guard++) {
    const painted = findPaintedAncestor(marker, editor, props)
    if (!painted) {
      break
    }
    const parent = marker.parentElement
    if (!parent || parent === editor || BLOCK_STOP.test(parent.tagName)) {
      break
    }
    splitAroundNode(parent, marker)
  }
}

function placeCaretInMarker(marker: HTMLElement) {
  const sel = window.getSelection()
  if (!sel) {
    return
  }
  const text = marker.firstChild
  const range = document.createRange()
  if (text && text.nodeType === Node.TEXT_NODE) {
    const len = text.textContent?.length ?? 0
    range.setStart(text, len)
  } else {
    range.selectNodeContents(marker)
    range.collapse(false)
  }
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

function resetBrowserPaintState() {
  try {
    document.execCommand("styleWithCSS", false, "true")
  } catch {
    /* optional */
  }
}

function pruneOldCaretMarkers(editor: HTMLElement, keep?: HTMLElement) {
  for (const node of Array.from(
    editor.querySelectorAll<HTMLElement>("[data-msp-caret]")
  )) {
    if (keep && node === keep) {
      continue
    }
    const text = node.textContent ?? ""
    if (text.replace(/\u200b/g, "").length === 0) {
      node.remove()
    } else {
      unwrapElement(node)
    }
  }
}

const SPLITTABLE_BLOCK = /^(P|DIV|H[1-6]|LI|PRE|BLOCKQUOTE)$/

function cssColorToHex(value: string): string {
  const v = value.trim().toLowerCase()
  if (!v || /^(inherit|initial|unset|revert|currentcolor)$/.test(v)) {
    return ""
  }
  if (v.startsWith("#")) {
    if (v.length === 4) {
      return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
    }
    return v.slice(0, 7)
  }
  const match = v.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  if (!match) {
    return v
  }
  const hex = (part: string) => Number(part).toString(16).padStart(2, "0")
  return `#${hex(match[1])}${hex(match[2])}${hex(match[3])}`
}

function explicitPaint(
  node: Node | null,
  editor: HTMLElement
): {color: string; highlight: string} {
  let color = ""
  let highlight = ""
  let el: HTMLElement | null =
    node && node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : (node?.parentElement ?? null)
  while (el && el !== editor) {
    if (!color) {
      const raw =
        el.style.color ||
        (el.tagName === "FONT" ? el.getAttribute("color") || "" : "")
      color = cssColorToHex(raw)
    }
    if (!highlight) {
      const bg = el.style.backgroundColor || ""
      if (
        bg &&
        !/^(transparent|inherit|initial|unset|revert)$/i.test(bg) &&
        !/^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/i.test(bg)
      ) {
        highlight = cssColorToHex(bg)
      }
    }
    el = el.parentElement
  }
  return {color, highlight}
}

function readTextAlign(editor: HTMLElement): string {
  const sel = window.getSelection()
  const node = sel?.anchorNode
  if (!node || !editor.contains(node)) {
    return ""
  }
  let el: HTMLElement | null =
    node instanceof Element ? (node as HTMLElement) : node.parentElement
  while (el && el !== editor) {
    const align = (el.style.textAlign || el.getAttribute("align") || "")
      .trim()
      .toLowerCase()
    if (align) {
      return align
    }
    el = el.parentElement
  }
  return ""
}

function blockElement(node: Node | null, editor: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null =
    node && node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : (node?.parentElement ?? null)
  while (el && el !== editor) {
    if (SPLITTABLE_BLOCK.test(el.tagName)) {
      return el
    }
    el = el.parentElement
  }
  return null
}

function textOverlap(range: Range, text: Text): [number, number] | null {
  const len = text.data.length
  if (!len || !range.intersectsNode(text)) {
    return null
  }
  let start = 0
  let end = len
  if (range.startContainer === text) {
    start = range.startOffset
  }
  if (range.endContainer === text) {
    end = range.endOffset
  }
  if (end <= start) {
    return null
  }
  return [start, end]
}

function textsInRange(
  editor: HTMLElement,
  range: Range,
  scope?: Node
): Text[] {
  const root =
    scope ??
    (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentNode)
  if (!root || !editor.contains(root)) {
    return []
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      try {
        if (!editor.contains(node) || !range.intersectsNode(node)) {
          return NodeFilter.FILTER_REJECT
        }
      } catch {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    }
  })
  const nodes: Text[] = []
  let current = walker.nextNode()
  while (current) {
    nodes.push(current as Text)
    current = walker.nextNode()
  }
  return nodes
}

function isolateTextSlice(text: Text, start: number, end: number): Text {
  let node = text
  if (start > 0) {
    node = node.splitText(start)
  }
  const size = end - start
  if (node.length > size) {
    node.splitText(size)
  }
  return node
}

function nearestPaintedBlock(
  node: Node,
  editor: HTMLElement,
  props: readonly string[]
): HTMLElement | null {
  let el: HTMLElement | null = node.parentElement
  while (el && el !== editor) {
    if (SPLITTABLE_BLOCK.test(el.tagName) && hasPaintStyle(el, props)) {
      return el
    }
    el = el.parentElement
  }
  return null
}

function coversContents(block: HTMLElement, range: Range): boolean {
  const full = document.createRange()
  full.selectNodeContents(block)
  return (
    range.compareBoundaryPoints(Range.START_TO_START, full) <= 0 &&
    range.compareBoundaryPoints(Range.END_TO_END, full) >= 0
  )
}

function stripElementPaint(el: HTMLElement, props: readonly string[]) {
  for (const prop of props) {
    el.style.removeProperty(prop)
  }
  if (props.includes("color")) {
    el.removeAttribute("color")
  }
  cleanupStyleShell(el)
}

function stripPaintDeep(root: HTMLElement, props: readonly string[]) {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>("*")).reverse()
  for (const el of nodes) {
    stripElementPaint(el, props)
  }
  stripElementPaint(root, props)
}

function peelInline(
  text: Text,
  editor: HTMLElement,
  props: readonly string[]
) {
  let node: Node = text
  for (let guard = 0; guard < 24; guard++) {
    const parent = node.parentElement
    if (!parent || parent === editor || BLOCK_STOP.test(parent.tagName)) {
      break
    }
    if (parent.childNodes.length !== 1) {
      splitAroundNode(parent, node)
      continue
    }
    if (hasPaintStyle(parent, props) || parent.tagName === "FONT") {
      stripElementPaint(parent, props)
      continue
    }
    node = parent
  }
}

function applyStyleToSlice(
  text: Text,
  start: number,
  end: number,
  styles: Record<string, string>
): HTMLElement {
  const slice = isolateTextSlice(text, start, end)
  const parent = slice.parentElement
  if (
    parent &&
    parent.tagName === "SPAN" &&
    parent.childNodes.length === 1 &&
    parent.firstChild === slice
  ) {
    Object.assign(parent.style, styles)
    return parent
  }
  const span = document.createElement("span")
  Object.assign(span.style, styles)
  slice.parentNode?.insertBefore(span, slice)
  span.appendChild(slice)
  return span
}

function paintTextRange(editor: HTMLElement, styles: Record<string, string>) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !selectionInside(editor)) {
    return
  }
  const range = sel.getRangeAt(0)
  if (range.collapsed) {
    const container = range.startContainer
    const el =
      container instanceof HTMLElement ? container : container.parentElement
    let host: HTMLElement | null = null
    if (el && el.tagName === "SPAN" && (el.textContent || "") === "\u200b") {
      host = el
    }
    if (!host) {
      host = document.createElement("span")
      host.appendChild(document.createTextNode("\u200b"))
      range.insertNode(host)
    }
    Object.assign(host.style, styles)
    const next = document.createRange()
    const text = host.firstChild
    if (text && text.nodeType === Node.TEXT_NODE) {
      next.setStart(text, text.textContent?.length ?? 0)
    } else {
      next.selectNodeContents(host)
    }
    next.collapse(false)
    sel.removeAllRanges()
    sel.addRange(next)
    return
  }

  const wrapped: HTMLElement[] = []
  for (const text of textsInRange(editor, range).reverse()) {
    const overlap = textOverlap(range, text)
    if (!overlap) {
      continue
    }
    wrapped.push(applyStyleToSlice(text, overlap[0], overlap[1], styles))
  }
  if (wrapped.length === 0) {
    return
  }
  const next = document.createRange()
  next.setStartBefore(wrapped[wrapped.length - 1])
  next.setEndAfter(wrapped[0])
  sel.removeAllRanges()
  sel.addRange(next)
}

/** Remove color/highlight from selection and stop it leaking into next typed chars. */
function clearPaintInSelection(
  editor: HTMLElement,
  props: readonly string[]
): void {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) {
    return
  }
  const range = sel.getRangeAt(0)
  pruneOldCaretMarkers(editor)

  if (!range.collapsed) {
    const paintedBlocks: HTMLElement[] = []
    for (const text of textsInRange(editor, range)) {
      const block = nearestPaintedBlock(text, editor, props)
      if (block && !paintedBlocks.includes(block)) {
        paintedBlocks.push(block)
      }
    }
    const inlineTexts = textsInRange(editor, range).filter(
      text => !nearestPaintedBlock(text, editor, props)
    )
    const inlineSlices = inlineTexts
      .map(text => {
        const overlap = textOverlap(range, text)
        return overlap ? {text, start: overlap[0], end: overlap[1]} : null
      })
      .filter((item): item is {text: Text; start: number; end: number} => !!item)

    const partialMask = getComputedStyle(editor)
    const mask: Record<string, string> = {}
    if (props.includes("color")) {
      mask.color = partialMask.color
    }
    if (props.includes("background-color") || props.includes("background")) {
      mask.backgroundColor = partialMask.backgroundColor
    }

    for (const block of paintedBlocks) {
      let full = false
      try {
        full = coversContents(block, range)
      } catch {
        full = false
      }
      if (full) {
        stripPaintDeep(block, props)
        continue
      }
      // Keep the paragraph intact. A span with the editor color hides the
      // inherited paint without splitting the block into new lines.
      for (const text of textsInRange(editor, range, block).reverse()) {
        const overlap = textOverlap(range, text)
        if (!overlap) {
          continue
        }
        applyStyleToSlice(text, overlap[0], overlap[1], mask)
      }
    }

    for (const slice of [...inlineSlices].reverse()) {
      if (!slice.text.isConnected) {
        continue
      }
      const isolated = isolateTextSlice(slice.text, slice.start, slice.end)
      peelInline(isolated, editor, props)
    }
  } else {
    const marker = document.createElement("span")
    marker.setAttribute("data-msp-caret", "")
    marker.appendChild(document.createTextNode("\u200b"))
    range.insertNode(marker)
    liftOutOfPaint(editor, marker, props)
    placeCaretInMarker(marker)
  }

  resetBrowserPaintState()
}

const INDENT_STEP = 40
const MAX_INDENT = 320

function blocksInSelection(editor: HTMLElement): HTMLElement[] {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) {
    return []
  }
  const range = sel.getRangeAt(0)
  const nodes = Array.from(
    editor.querySelectorAll<HTMLElement>(
      "p, div, h1, h2, h3, h4, h5, h6, li, pre, blockquote"
    )
  )
  const hits = nodes.filter(el => {
    if (el === editor) {
      return false
    }
    try {
      return range.intersectsNode(el)
    } catch {
      return false
    }
  })
  const innermost = hits.filter(
    el => !hits.some(other => other !== el && el.contains(other))
  )
  if (innermost.length > 0) {
    return innermost
  }
  const single = blockElement(range.startContainer, editor)
  return single ? [single] : []
}

function changeIndent(editor: HTMLElement, direction: 1 | -1) {
  const sel = window.getSelection()
  const anchor = sel?.anchorNode
  const anchorEl =
    anchor instanceof Element ? anchor : anchor?.parentElement ?? null
  if (anchorEl?.closest("li")) {
    document.execCommand(direction > 0 ? "indent" : "outdent")
    normalizeRichRoot(editor)
    return
  }
  let blocks = blocksInSelection(editor)
  if (blocks.length === 0) {
    const cell = anchorEl?.closest("td, th")
    if (cell instanceof HTMLElement && editor.contains(cell)) {
      blocks = [cell]
    } else if (!anchorEl?.closest("table")) {
      document.execCommand("formatBlock", false, "p")
      blocks = blocksInSelection(editor)
    }
  }
  for (const block of blocks) {
    const current = parseFloat(block.style.marginLeft) || 0
    const next = Math.max(
      0,
      Math.min(MAX_INDENT, current + direction * INDENT_STEP)
    )
    if (next <= 0) {
      block.style.removeProperty("margin-left")
    } else {
      block.style.marginLeft = `${Math.round(next)}px`
    }
    if (block.style.length === 0) {
      block.removeAttribute("style")
    }
  }
}

type CmdState = {
  bold: boolean
  italic: boolean
  underline: boolean
  strikeThrough: boolean
  subscript: boolean
  superscript: boolean
  insertUnorderedList: boolean
  insertOrderedList: boolean
  justifyLeft: boolean
  justifyCenter: boolean
  justifyRight: boolean
  justifyFull: boolean
  createLink: boolean
  block: string
}

const EMPTY_STATE: CmdState = {
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  subscript: false,
  superscript: false,
  insertUnorderedList: false,
  insertOrderedList: false,
  justifyLeft: false,
  justifyCenter: false,
  justifyRight: false,
  justifyFull: false,
  createLink: false,
  block: "p"
}

function queryState(command: string): boolean {
  try {
    return document.queryCommandState(command)
  } catch {
    return false
  }
}

function queryBlock(): string {
  try {
    const value = String(document.queryCommandValue("formatBlock") || "")
      .toLowerCase()
      .replace(/[<>]/g, "")
    return value || "p"
  } catch {
    return "p"
  }
}

function readCmdState(): CmdState {
  return {
    bold: queryState("bold"),
    italic: queryState("italic"),
    underline: queryState("underline"),
    strikeThrough: queryState("strikeThrough"),
    subscript: queryState("subscript"),
    superscript: queryState("superscript"),
    insertUnorderedList: queryState("insertUnorderedList"),
    insertOrderedList: queryState("insertOrderedList"),
    justifyLeft: queryState("justifyLeft"),
    justifyCenter: queryState("justifyCenter"),
    justifyRight: queryState("justifyRight"),
    justifyFull: queryState("justifyFull"),
    createLink: queryState("createLink"),
    block: queryBlock()
  }
}

function selectionInside(el: HTMLElement | null): boolean {
  if (!el) {
    return false
  }
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) {
    return false
  }
  const node = sel.anchorNode
  return !!node && el.contains(node.nodeType === 1 ? node : node.parentNode)
}

async function dataUrlsFromFiles(files: File[]): Promise<string[]> {
  const urls: string[] = []
  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) {
      continue
    }
    try {
      urls.push(await fileToDataUrl(file))
    } catch {
      /* skip unreadable clipboard files */
    }
  }
  return urls
}

function mergeImages(html: string, dataUrls: string[]): string {
  if (dataUrls.length === 0) {
    return html
  }
  const doc = new DOMParser().parseFromString(html || "<div></div>", "text/html")
  let i = 0
  for (const img of Array.from(doc.querySelectorAll("img"))) {
    const src = img.getAttribute("src") || ""
    if (!SAFE_IMG.test(src) && i < dataUrls.length) {
      img.setAttribute("src", dataUrls[i++])
    }
  }
  while (i < dataUrls.length) {
    const img = doc.createElement("img")
    img.setAttribute("src", dataUrls[i++])
    doc.body.appendChild(img)
  }
  return doc.body.innerHTML
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function normalizeUrl(raw: string): string | null {
  const url = (raw || "").trim()
  if (!url) {
    return null
  }
  if (/^(https?:|mailto:|#)/i.test(url)) {
    return url
  }
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(url)) {
    return `https://${url}`
  }
  return url
}

function isEditorVisuallyEmpty(el: HTMLElement): boolean {
  if (el.querySelector("img, table, hr, video, iframe")) {
    return false
  }
  return !(el.textContent || "").replace(/\u00a0/g, " ").trim()
}

type UploadedImage = {
  src: string
  alt?: string
}

type EditorHelpers = {
  insertHtml: (html: string) => void
}

type EditorArgs = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  disabled?: boolean
  /** Taller editor without max-height (handbook articles). */
  tall?: boolean
  /** If set, toolbar image picks call this instead of embedding a data URL. */
  uploadImage?: (file: File) => Promise<UploadedImage | null>
  /** Extra toolbar controls after the built-in ones (receives insert helpers). */
  extraToolbar?: (helpers: EditorHelpers) => ReactNode
}

type ToolBtnProps = {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}

function ToolBtn({label, active, disabled, onClick, children}: ToolBtnProps) {
  return (
    <Tooltip label={label}>
      <ActionIcon
        variant={active ? "filled" : "default"}
        color={active ? "pmg" : undefined}
        size="sm"
        disabled={disabled}
        onMouseDown={e => e.preventDefault()}
        onClick={onClick}
      >
        {children}
      </ActionIcon>
    </Tooltip>
  )
}

function ToolSep() {
  return <span className={classes.toolbarSep} aria-hidden />
}

type ColorMenuProps = {
  label: string
  colors: string[]
  value: string
  clearValue?: string
  clearLabel?: string
  mode: "text" | "highlight"
  onOpen: () => void
  onPick: (color: string) => void
}

function ColorMenu({
  label,
  colors,
  value,
  clearValue,
  clearLabel,
  mode,
  onOpen,
  onPick
}: ColorMenuProps) {
  const barColor =
    mode === "highlight"
      ? !value || value === CLEAR_HIGHLIGHT || value === "transparent"
        ? "transparent"
        : value
      : value || "var(--mantine-color-text)"

  return (
    <Menu
      shadow="md"
      width={220}
      withinPortal
      position="bottom-start"
      closeOnItemClick
    >
      <Menu.Target>
        <Tooltip label={label}>
          <ActionIcon
            variant="default"
            size="sm"
            className={classes.colorBtn}
            aria-label={label}
            onMouseDown={e => {
              e.preventDefault()
              onOpen()
            }}
          >
            {mode === "text" ? (
              <IconLetterA size={15} />
            ) : (
              <IconHighlight size={15} />
            )}
            <span
              className={classes.colorBar}
              style={{
                background:
                  barColor === "transparent"
                    ? "repeating-linear-gradient(135deg,#ccc 0 1px,transparent 1px 4px)"
                    : barColor
              }}
            />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        {clearValue != null && clearLabel ? (
          <Menu.Item
            leftSection={<IconX size={14} />}
            onMouseDown={e => {
              e.preventDefault()
              onOpen()
            }}
            onClick={() => onPick(clearValue)}
          >
            {clearLabel}
          </Menu.Item>
        ) : null}
        <div className={classes.swatchGrid}>
          {colors.map(color => (
            <UnstyledButton
              key={color}
              className={classes.swatch}
              style={{backgroundColor: color}}
              data-active={
                value && value.toLowerCase() === color.toLowerCase()
                  ? "true"
                  : undefined
              }
              aria-label={color}
              onMouseDown={e => {
                e.preventDefault()
                onOpen()
              }}
              onClick={() => onPick(color)}
            />
          ))}
        </div>
      </Menu.Dropdown>
    </Menu>
  )
}

export function MspRichTextEditor({
  value,
  onChange,
  placeholder,
  disabled,
  tall,
  uploadImage,
  extraToolbar
}: EditorArgs) {
  const {t} = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const savedRange = useRef<Range | null>(null)
  const lastEmitted = useRef<string | null>(null)
  const [cmd, setCmd] = useState<CmdState>(EMPTY_STATE)
  const [empty, setEmpty] = useState(true)
  const [textColor, setTextColor] = useState("")
  const [highlightColor, setHighlightColor] = useState(CLEAR_HIGHLIGHT)

  const syncEmpty = useCallback(() => {
    const el = ref.current
    setEmpty(!el || isEditorVisuallyEmpty(el))
  }, [])

  const emit = useCallback(() => {
    const el = ref.current
    if (!el) {
      return
    }
    const html = el.innerHTML
    lastEmitted.current = html
    onChange(html)
    syncEmpty()
  }, [onChange, syncEmpty])

  const refreshCmd = useCallback(() => {
    const editor = ref.current
    if (!selectionInside(editor) || !editor) {
      return
    }
    const align = readTextAlign(editor)
    const next = readCmdState()
    next.justifyLeft = align === "left" || align === "start"
    next.justifyCenter = align === "center"
    next.justifyRight = align === "right" || align === "end"
    next.justifyFull = align === "justify"
    setCmd(next)
    const sel = window.getSelection()
    const paint = explicitPaint(sel?.anchorNode ?? null, editor)
    setTextColor(paint.color)
    setHighlightColor(paint.highlight || CLEAR_HIGHLIGHT)
  }, [])

  const rememberSelection = useCallback(() => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && selectionInside(ref.current)) {
      savedRange.current = sel.getRangeAt(0).cloneRange()
    }
  }, [])

  const restoreSelection = useCallback(() => {
    const el = ref.current
    if (!el) {
      return
    }
    el.focus()
    const sel = window.getSelection()
    if (!sel) {
      return
    }
    if (savedRange.current && el.contains(savedRange.current.commonAncestorContainer)) {
      sel.removeAllRanges()
      sel.addRange(savedRange.current)
      return
    }
    if (!selectionInside(el)) {
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
      sel.removeAllRanges()
      sel.addRange(range)
    }
  }, [])

  const run = useCallback(
    (fn: () => void) => {
      restoreSelection()
      try {
        document.execCommand("styleWithCSS", false, "true")
      } catch {
        /* optional */
      }
      fn()
      rememberSelection()
      emit()
      refreshCmd()
    },
    [emit, refreshCmd, rememberSelection, restoreSelection]
  )

  const exec = useCallback(
    (command: string, value?: string) => {
      run(() => {
        document.execCommand(command, false, value)
      })
    },
    [run]
  )

  const formatBlock = useCallback(
    (tag: string) => {
      run(() => {
        const wrapped = `<${tag}>`
        const ok = document.execCommand("formatBlock", false, wrapped)
        if (!ok) {
          document.execCommand("formatBlock", false, tag)
        }
      })
    },
    [run]
  )

  const insertHtml = useCallback(
    (html: string) => {
      if (!html) {
        return
      }
      run(() => {
        document.execCommand("insertHTML", false, html)
      })
    },
    [run]
  )

  useEffect(() => {
    const el = ref.current
    if (!el) {
      return
    }
    if (value === lastEmitted.current) {
      syncEmpty()
      return
    }
    const next = normalizeRichHtml(value || "")
    if (el.innerHTML === next) {
      lastEmitted.current = value
      syncEmpty()
      return
    }
    el.innerHTML = next
    lastEmitted.current = value
    syncEmpty()
  }, [value, syncEmpty])

  useEffect(() => {
    try {
      document.execCommand("defaultParagraphSeparator", false, "p")
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const onSel = () => {
      rememberSelection()
      refreshCmd()
    }
    document.addEventListener("selectionchange", onSel)
    return () => document.removeEventListener("selectionchange", onSel)
  }, [refreshCmd, rememberSelection])

  const onPaste = async (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const data = event.clipboardData
    const rawHtml = data.getData("text/html")
    const plain = data.getData("text/plain")
    const urls = await dataUrlsFromFiles(clipboardImages(data))
    let html = ""
    if (rawHtml) {
      html = sanitizePastedHtml(mergeImages(rawHtml, urls))
    } else if (urls.length > 0) {
      html = urls.map(src => `<img src="${src}" alt="" />`).join("")
    } else if (plain) {
      html = sanitizePastedHtml(
        plain
          .split(/\n{2,}/)
          .map(p => `<p>${escapeText(p).replace(/\n/g, "<br>")}</p>`)
          .join("")
      )
    }
    insertHtml(html)
  }

  const insertImageFile = async (file: File) => {
    if (file.size > MAX_IMAGE_BYTES) {
      return
    }
    if (uploadImage) {
      const uploaded = await uploadImage(file)
      if (!uploaded?.src) {
        return
      }
      insertHtml(
        `<img src="${escapeAttr(uploaded.src)}" alt="${escapeAttr(uploaded.alt || "")}" />`
      )
      return
    }
    const src = await fileToDataUrl(file)
    insertHtml(`<img src="${src}" alt="" />`)
  }

  const currentLinkHref = (): string => {
    const sel = window.getSelection()
    const node = sel?.anchorNode
    if (!node) {
      return ""
    }
    const el = node instanceof Element ? node : node.parentElement
    return el?.closest("a")?.getAttribute("href") || ""
  }

  const insertLink = () => {
    restoreSelection()
    const raw = window.prompt(
      t("handbook.link_prompt"),
      currentLinkHref() || "https://"
    )
    const url = normalizeUrl(raw || "")
    if (!url) {
      return
    }
    run(() => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) {
        document.execCommand(
          "insertHTML",
          false,
          `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeText(url)}</a>`
        )
      } else {
        document.execCommand("createLink", false, url)
        const node = sel.anchorNode
        const el = node instanceof Element ? node : node?.parentElement
        const anchor = el?.closest("a")
        if (anchor) {
          anchor.setAttribute("href", url)
          anchor.setAttribute("target", "_blank")
          anchor.setAttribute("rel", "noopener noreferrer")
        }
      }
    })
  }

  const applyForeColor = (color: string) => {
    const editor = ref.current
    if (!editor) {
      return
    }
    if (!color) {
      setTextColor("")
      run(() => {
        clearPaintInSelection(editor, COLOR_PROPS)
        const sel = window.getSelection()
        if (sel && sel.rangeCount > 0) {
          savedRange.current = sel.getRangeAt(0).cloneRange()
        }
      })
      return
    }
    setTextColor(color)
    run(() => {
      paintTextRange(editor, {color})
    })
  }

  const applyHilite = (color: string) => {
    const editor = ref.current
    if (!editor) {
      return
    }
    if (!color || color === CLEAR_HIGHLIGHT) {
      setHighlightColor(CLEAR_HIGHLIGHT)
      run(() => {
        clearPaintInSelection(editor, HIGHLIGHT_PROPS)
        const sel = window.getSelection()
        if (sel && sel.rangeCount > 0) {
          savedRange.current = sel.getRangeAt(0).cloneRange()
        }
      })
      return
    }
    setHighlightColor(color)
    run(() => {
      paintTextRange(editor, {backgroundColor: color})
    })
  }

  return (
    <div>
      {!disabled ? (
        <div className={classes.toolbar}>
          <Group gap={4} wrap="wrap">
            <ToolBtn
              label={t("handbook.fmt.undo")}
              onClick={() => exec("undo")}
            >
              <IconArrowBackUp size={16} />
            </ToolBtn>
            <ToolBtn
              label={t("handbook.fmt.redo")}
              onClick={() => exec("redo")}
            >
              <IconArrowForwardUp size={16} />
            </ToolBtn>

            <ToolSep />

            <ToolBtn
              label={t("handbook.fmt.bold")}
              active={cmd.bold}
              onClick={() => exec("bold")}
            >
              <IconBold size={16} />
            </ToolBtn>
            <ToolBtn
              label={t("handbook.fmt.italic")}
              active={cmd.italic}
              onClick={() => exec("italic")}
            >
              <IconItalic size={16} />
            </ToolBtn>
            <ToolBtn
              label={t("handbook.fmt.underline")}
              active={cmd.underline}
              onClick={() => exec("underline")}
            >
              <IconUnderline size={16} />
            </ToolBtn>
            <ToolBtn
              label={t("handbook.fmt.strike")}
              active={cmd.strikeThrough}
              onClick={() => exec("strikeThrough")}
            >
              <IconStrikethrough size={16} />
            </ToolBtn>
            <ToolBtn
              label={t("handbook.fmt.sub")}
              active={cmd.subscript}
              onClick={() => exec("subscript")}
            >
              <IconSubscript size={16} />
            </ToolBtn>
            <ToolBtn
              label={t("handbook.fmt.sup")}
              active={cmd.superscript}
              onClick={() => exec("superscript")}
            >
              <IconSuperscript size={16} />
            </ToolBtn>

            <ToolSep />

            <Menu shadow="md" width={180} withinPortal>
              <Menu.Target>
                <Tooltip label={t("handbook.fmt.heading")}>
                  <ActionIcon
                    variant={
                      ["h1", "h2", "h3"].includes(cmd.block)
                        ? "filled"
                        : "default"
                    }
                    color={
                      ["h1", "h2", "h3"].includes(cmd.block) ? "pmg" : undefined
                    }
                    size="sm"
                    onMouseDown={e => {
                      e.preventDefault()
                      rememberSelection()
                    }}
                  >
                    {cmd.block === "h1" ? (
                      <IconH1 size={16} />
                    ) : cmd.block === "h2" ? (
                      <IconH2 size={16} />
                    ) : cmd.block === "h3" ? (
                      <IconH3 size={16} />
                    ) : (
                      <span style={{fontSize: 13, fontWeight: 700, lineHeight: 1}}>
                        P
                      </span>
                    )}
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => formatBlock("p")}>
                  {t("handbook.fmt.paragraph")}
                </Menu.Item>
                <Menu.Item onClick={() => formatBlock("h1")}>
                  {t("handbook.fmt.h1")}
                </Menu.Item>
                <Menu.Item onClick={() => formatBlock("h2")}>
                  {t("handbook.fmt.h2")}
                </Menu.Item>
                <Menu.Item onClick={() => formatBlock("h3")}>
                  {t("handbook.fmt.h3")}
                </Menu.Item>
                <Menu.Item onClick={() => formatBlock("blockquote")}>
                  {t("handbook.fmt.quote")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>

            <ToolSep />

            <ToolBtn
              label={t("handbook.fmt.align_left")}
              active={cmd.justifyLeft}
              onClick={() => exec("justifyLeft")}
            >
              <IconAlignLeft size={16} />
            </ToolBtn>
            <ToolBtn
              label={t("handbook.fmt.align_center")}
              active={cmd.justifyCenter}
              onClick={() => exec("justifyCenter")}
            >
              <IconAlignCenter size={16} />
            </ToolBtn>
            <ToolBtn
              label={t("handbook.fmt.align_right")}
              active={cmd.justifyRight}
              onClick={() => exec("justifyRight")}
            >
              <IconAlignRight size={16} />
            </ToolBtn>
            <ToolBtn
              label={t("handbook.fmt.align_justify")}
              active={cmd.justifyFull}
              onClick={() => exec("justifyFull")}
            >
              <IconAlignJustified size={16} />
            </ToolBtn>

            <ToolSep />

            <ToolBtn
              label={t("handbook.fmt.ul")}
              active={cmd.insertUnorderedList}
              onClick={() => exec("insertUnorderedList")}
            >
              <IconList size={16} />
            </ToolBtn>
            <ToolBtn
              label={t("handbook.fmt.ol")}
              active={cmd.insertOrderedList}
              onClick={() => exec("insertOrderedList")}
            >
              <IconListNumbers size={16} />
            </ToolBtn>
            <ToolBtn
              label={t("handbook.fmt.outdent")}
              onClick={() => {
                const editor = ref.current
                if (!editor) {
                  return
                }
                run(() => changeIndent(editor, -1))
              }}
            >
              <IconIndentDecrease size={16} />
            </ToolBtn>
            <ToolBtn
              label={t("handbook.fmt.indent")}
              onClick={() => {
                const editor = ref.current
                if (!editor) {
                  return
                }
                run(() => changeIndent(editor, 1))
              }}
            >
              <IconIndentIncrease size={16} />
            </ToolBtn>

            <ToolSep />

            <ToolBtn
              label={t("handbook.fmt.link")}
              active={cmd.createLink}
              onClick={insertLink}
            >
              <IconLink size={16} />
            </ToolBtn>
            <ToolBtn
              label={t("handbook.fmt.unlink")}
              onClick={() => exec("unlink")}
            >
              <IconLinkOff size={16} />
            </ToolBtn>
            <ToolBtn
              label={t("handbook.fmt.image")}
              onClick={() => imageInput.current?.click()}
            >
              <IconPhoto size={16} />
            </ToolBtn>
            <ToolBtn
              label={t("handbook.fmt.hr")}
              onClick={() => exec("insertHorizontalRule")}
            >
              <IconSeparator size={16} />
            </ToolBtn>

            <ToolSep />

            <ColorMenu
              label={t("handbook.fmt.color")}
              mode="text"
              colors={TEXT_COLORS}
              value={textColor}
              clearValue=""
              clearLabel={t("handbook.fmt.color_auto")}
              onOpen={rememberSelection}
              onPick={applyForeColor}
            />
            <ColorMenu
              label={t("handbook.fmt.highlight")}
              mode="highlight"
              colors={HIGHLIGHT_COLORS}
              value={highlightColor}
              clearValue={CLEAR_HIGHLIGHT}
              clearLabel={t("handbook.fmt.highlight_none")}
              onOpen={rememberSelection}
              onPick={applyHilite}
            />

            <ToolSep />

            <ToolBtn
              label={t("handbook.fmt.clear")}
              onClick={() => {
                const editor = ref.current
                if (!editor) {
                  return
                }
                run(() => {
                  const sel = window.getSelection()
                  const range =
                    sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null
                  if (range && !range.collapsed) {
                    for (const block of blocksInSelection(editor)) {
                      try {
                        if (coversContents(block, range)) {
                          block.style.removeProperty("margin-left")
                          if (block.style.length === 0) {
                            block.removeAttribute("style")
                          }
                        }
                      } catch {
                        /* keep the rest of the clear */
                      }
                    }
                  }
                  document.execCommand("removeFormat")
                  clearPaintInSelection(editor, [
                    ...COLOR_PROPS,
                    ...HIGHLIGHT_PROPS
                  ])
                })
              }}
            >
              <IconClearFormatting size={16} />
            </ToolBtn>

            {extraToolbar ? (
              <>
                <ToolSep />
                {extraToolbar({insertHtml})}
              </>
            ) : null}

            <input
              ref={imageInput}
              type="file"
              accept="image/*"
              hidden
              onChange={e => {
                const file = e.currentTarget.files?.[0]
                e.currentTarget.value = ""
                if (file) void insertImageFile(file)
              }}
            />
          </Group>
        </div>
      ) : null}
      <div
        ref={ref}
        className={tall ? `${classes.editor} ${classes.editorTall}` : classes.editor}
        contentEditable={!disabled}
        data-placeholder={placeholder}
        data-empty={empty ? "true" : "false"}
        suppressContentEditableWarning
        onInput={() => {
          emit()
          refreshCmd()
        }}
        onBlur={emit}
        onKeyUp={refreshCmd}
        onMouseUp={() => {
          rememberSelection()
          refreshCmd()
        }}
        onPaste={e => void onPaste(e)}
      />
    </div>
  )
}

export function MspRichTextView({html}: {html: string}) {
  if (!html.trim()) {
    return null
  }
  if (!looksLikeHtml(html)) {
    return (
      <div className={classes.rich}>
        {html.split(/\n{2,}/).map((paragraph, idx) => (
          <p key={idx} style={{whiteSpace: "pre-line"}}>
            {paragraph}
          </p>
        ))}
      </div>
    )
  }
  return (
    <div
      className={classes.rich}
      dangerouslySetInnerHTML={{__html: normalizeRichHtml(html)}}
    />
  )
}
