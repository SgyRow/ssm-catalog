import {ActionIcon, Group, Tooltip} from "@mantine/core"
import {
  IconBold,
  IconItalic,
  IconList,
  IconListNumbers,
  IconPhoto,
  IconUnderline
} from "@tabler/icons-react"
import {useEffect, useRef, type ClipboardEvent} from "react"
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

function exec(command: string, value?: string) {
  document.execCommand(command, false, value)
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

function insertHtml(html: string) {
  if (!html) {
    return
  }
  document.execCommand("insertHTML", false, html)
}

type EditorArgs = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  disabled?: boolean
}

export function MspRichTextEditor({
  value,
  onChange,
  placeholder,
  disabled
}: EditorArgs) {
  const {t} = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || el.innerHTML === value) {
      return
    }
    el.innerHTML = value || ""
  }, [value])

  const emit = () => {
    onChange(ref.current?.innerHTML ?? "")
  }

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
      html = urls.map(src => `<img src="${src}" />`).join("")
    } else if (plain) {
      html = sanitizePastedHtml(
        plain
          .split(/\n{2,}/)
          .map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`)
          .join("")
      )
    }
    insertHtml(html)
    emit()
  }

  const insertImageFile = async (file: File) => {
    if (file.size > MAX_IMAGE_BYTES) {
      return
    }
    const src = await fileToDataUrl(file)
    ref.current?.focus()
    insertHtml(`<img src="${src}" alt="" />`)
    emit()
  }

  return (
    <div>
      {!disabled ? (
        <Group gap={4} mb={6}>
          <Tooltip label={t("handbook.fmt.bold")}>
            <ActionIcon
              variant="default"
              size="sm"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                exec("bold")
                emit()
              }}
            >
              <IconBold size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("handbook.fmt.italic")}>
            <ActionIcon
              variant="default"
              size="sm"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                exec("italic")
                emit()
              }}
            >
              <IconItalic size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("handbook.fmt.underline")}>
            <ActionIcon
              variant="default"
              size="sm"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                exec("underline")
                emit()
              }}
            >
              <IconUnderline size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("handbook.fmt.ul")}>
            <ActionIcon
              variant="default"
              size="sm"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                exec("insertUnorderedList")
                emit()
              }}
            >
              <IconList size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("handbook.fmt.ol")}>
            <ActionIcon
              variant="default"
              size="sm"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                exec("insertOrderedList")
                emit()
              }}
            >
              <IconListNumbers size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("handbook.fmt.image")}>
            <ActionIcon
              variant="default"
              size="sm"
              onMouseDown={e => e.preventDefault()}
              onClick={() => imageInput.current?.click()}
            >
              <IconPhoto size={16} />
            </ActionIcon>
          </Tooltip>
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
      ) : null}
      <div
        ref={ref}
        className={classes.editor}
        contentEditable={!disabled}
        data-placeholder={placeholder}
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
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
      dangerouslySetInnerHTML={{__html: html}}
    />
  )
}
