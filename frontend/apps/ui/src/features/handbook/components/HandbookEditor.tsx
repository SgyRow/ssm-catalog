import classes from "@/features/handbook/Handbook.module.css"
import {uploadHandbookAsset} from "@/features/handbook/handbookApiSlice"
import {ActionIcon, Group, Tooltip} from "@mantine/core"
import {
  IconBold,
  IconH2,
  IconHeading,
  IconItalic,
  IconLink,
  IconList,
  IconListNumbers,
  IconPaperclip,
  IconPhoto,
  IconUnderline
} from "@tabler/icons-react"
import {useEffect, useRef} from "react"
import {useTranslation} from "react-i18next"

type Args = {
  articleId: string
  html: string
  onChange: (html: string) => void
  disabled?: boolean
}

function exec(command: string, value?: string) {
  document.execCommand(command, false, value)
}

export default function HandbookEditor({
  articleId,
  html,
  onChange,
  disabled
}: Args) {
  const {t} = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || el.innerHTML === html) {
      return
    }
    el.innerHTML = html || ""
  }, [html])

  const emit = () => {
    onChange(ref.current?.innerHTML ?? "")
  }

  const insertLink = () => {
    const url = window.prompt(t("handbook.link_prompt"))
    if (url) {
      exec("createLink", url)
      emit()
    }
  }

  const upload = async (file: File, asImage: boolean) => {
    const asset = await uploadHandbookAsset(articleId, file)
    const el = ref.current
    if (!el) {
      return
    }
    el.focus()
    if (asImage) {
      exec("insertHTML", `<img src="${asset.url}" alt="${asset.filename}" />`)
    } else {
      exec(
        "insertHTML",
        `<a href="${asset.url}" target="_blank" rel="noreferrer">${asset.filename}</a>`
      )
    }
    emit()
  }

  return (
    <div>
      {!disabled ? (
        <Group gap={4} mb="xs">
          <Tooltip label={t("handbook.fmt.bold")}>
            <ActionIcon variant="default" onClick={() => exec("bold")}>
              <IconBold size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("handbook.fmt.italic")}>
            <ActionIcon variant="default" onClick={() => exec("italic")}>
              <IconItalic size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("handbook.fmt.underline")}>
            <ActionIcon variant="default" onClick={() => exec("underline")}>
              <IconUnderline size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("handbook.fmt.h2")}>
            <ActionIcon
              variant="default"
              onClick={() => exec("formatBlock", "h2")}
            >
              <IconH2 size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("handbook.fmt.h3")}>
            <ActionIcon
              variant="default"
              onClick={() => exec("formatBlock", "h3")}
            >
              <IconHeading size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("handbook.fmt.ul")}>
            <ActionIcon
              variant="default"
              onClick={() => exec("insertUnorderedList")}
            >
              <IconList size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("handbook.fmt.ol")}>
            <ActionIcon
              variant="default"
              onClick={() => exec("insertOrderedList")}
            >
              <IconListNumbers size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("handbook.fmt.link")}>
            <ActionIcon variant="default" onClick={insertLink}>
              <IconLink size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("handbook.fmt.image")}>
            <ActionIcon
              variant="default"
              onClick={() => imageInput.current?.click()}
            >
              <IconPhoto size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("handbook.fmt.file")}>
            <ActionIcon
              variant="default"
              onClick={() => fileInput.current?.click()}
            >
              <IconPaperclip size={16} />
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
              if (file) void upload(file, true)
            }}
          />
          <input
            ref={fileInput}
            type="file"
            hidden
            onChange={e => {
              const file = e.currentTarget.files?.[0]
              e.currentTarget.value = ""
              if (file) void upload(file, false)
            }}
          />
        </Group>
      ) : null}
      <div
        ref={ref}
        className={`${classes.editor} ${classes.article}`}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
      />
    </div>
  )
}
