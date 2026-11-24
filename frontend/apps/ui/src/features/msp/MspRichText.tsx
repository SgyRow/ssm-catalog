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

function liftOutOfPaint(
  editor: HTMLElement,
  marker: HTMLElement,
  props: readonly string[]
) {
  // Split every ancestor until the marker sits outside painted wrappers,
  // including intermediate unstyled tags like <b>/<i>.
  for (let guard = 0; guard < 32; guard++) {
    const painted = findPaintedAncestor(marker, editor, props)
    if (!painted) {
      break
    }
    const parent = marker.parentElement
    if (!parent || parent === editor) {
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

function resetBrowserPaintState(props: readonly string[]) {
  try {
    document.execCommand("styleWithCSS", false, "true")
  } catch {
    /* optional */
  }
  if (props.includes("background-color")) {
    try {
      document.execCommand("hiliteColor", false, "transparent")
    } catch {
      /* ignore */
    }
  }
  if (props.includes("color")) {
    try {
      document.execCommand("foreColor", false, "#000000")
    } catch {
      /* ignore */
    }
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
    // Pull selected HTML out, strip paint, then lift the clean block out of
    // any still-painted ancestors (otherwise parent background keeps showing).
    const holder = document.createElement("span")
    holder.setAttribute("data-msp-caret", "")
    const frag = range.extractContents()
    stripPaintFromTree(frag, props)
    holder.appendChild(frag)
    if (!holder.hasChildNodes()) {
      holder.appendChild(document.createTextNode("\u200b"))
    }
    range.insertNode(holder)
    liftOutOfPaint(editor, holder, props)
    stripPaintFromTree(holder, props)

    // Unwrap holder but keep a clean caret marker for further typing.
    const marker = document.createElement("span")
    marker.setAttribute("data-msp-caret", "")
    marker.appendChild(document.createTextNode("\u200b"))
    const parent = holder.parentNode
    if (parent) {
      parent.insertBefore(marker, holder.nextSibling)
      while (holder.firstChild) {
        parent.insertBefore(holder.firstChild, marker)
      }
      parent.removeChild(holder)
    }
    placeCaretInMarker(marker)
  } else {
    const marker = document.createElement("span")
    marker.setAttribute("data-msp-caret", "")
    marker.appendChild(document.createTextNode("\u200b"))
    range.insertNode(marker)
    liftOutOfPaint(editor, marker, props)
    placeCaretInMarker(marker)
  }

  resetBrowserPaintState(props)
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
    value === CLEAR_HIGHLIGHT || value === "transparent"
      ? "transparent"
      : value

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
              data-active={value === color ? "true" : undefined}
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
  const [cmd, setCmd] = useState<CmdState>(EMPTY_STATE)
  const [empty, setEmpty] = useState(true)
  const [textColor, setTextColor] = useState("#000000")
  const [highlightColor, setHighlightColor] = useState("#fff3bf")

  const syncEmpty = useCallback(() => {
    const el = ref.current
    setEmpty(!el || isEditorVisuallyEmpty(el))
  }, [])

  const emit = useCallback(() => {
    const el = ref.current
    if (!el) {
      return
    }
    onChange(el.innerHTML)
    syncEmpty()
  }, [onChange, syncEmpty])

  const refreshCmd = useCallback(() => {
    if (!selectionInside(ref.current)) {
      return
    }
    setCmd(readCmdState())
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
    if (!el || el.innerHTML === value) {
      syncEmpty()
      return
    }
    el.innerHTML = value || ""
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

  const wrapSelectionStyle = (styles: Record<string, string>): boolean => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) {
      return false
    }
    const range = sel.getRangeAt(0)
    if (range.collapsed) {
      return false
    }

    const span = document.createElement("span")
    Object.assign(span.style, styles)

    try {
      range.surroundContents(span)
    } catch {
      const fragment = range.extractContents()
      span.appendChild(fragment)
      range.insertNode(span)
    }

    sel.removeAllRanges()
    const next = document.createRange()
    next.selectNodeContents(span)
    sel.addRange(next)
    savedRange.current = next.cloneRange()
    return true
  }

  const applyForeColor = (color: string) => {
    if (!color) {
      return
    }
    const editor = ref.current
    if (!editor) {
      return
    }
    if (color === "#000000") {
      // "Automatic": strip color and leave caret outside painted spans.
      setTextColor(color)
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
      try {
        document.execCommand("styleWithCSS", false, "true")
      } catch {
        /* optional */
      }
      const ok = document.execCommand("foreColor", false, color)
      if (!ok) {
        wrapSelectionStyle({color})
      }
    })
  }

  const applyHilite = (color: string) => {
    if (!color) {
      return
    }
    const editor = ref.current
    if (!editor) {
      return
    }
    if (color === CLEAR_HIGHLIGHT) {
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
      try {
        document.execCommand("styleWithCSS", false, "true")
      } catch {
        /* optional */
      }
      // Prefer hiliteColor: backColor often paints the whole editor in Chrome.
      let ok = false
      try {
        ok = document.execCommand("hiliteColor", false, color)
      } catch {
        ok = false
      }
      if (!ok) {
        wrapSelectionStyle({backgroundColor: color})
      }
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
                    ) : cmd.block === "h3" ? (
                      <IconH3 size={16} />
                    ) : (
                      <IconH2 size={16} />
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
              onClick={() => exec("outdent")}
            >
              <IconIndentDecrease size={16} />
            </ToolBtn>
            <ToolBtn
              label={t("handbook.fmt.indent")}
              onClick={() => exec("indent")}
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
              clearValue="#000000"
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
              onClick={() => exec("removeFormat")}
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
    <div className={classes.rich} dangerouslySetInnerHTML={{__html: html}} />
  )
}
