import {uploadHandbookAsset} from "@/features/handbook/handbookApiSlice"
import {MspRichTextEditor} from "@/features/msp/MspRichText"
import {ActionIcon, Tooltip} from "@mantine/core"
import {IconPaperclip} from "@tabler/icons-react"
import {useRef} from "react"
import {useTranslation} from "react-i18next"

type Args = {
  articleId: string
  html: string
  onChange: (html: string) => void
  disabled?: boolean
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

export default function HandbookEditor({
  articleId,
  html,
  onChange,
  disabled
}: Args) {
  const {t} = useTranslation()
  const fileInput = useRef<HTMLInputElement>(null)

  return (
    <MspRichTextEditor
      value={html}
      onChange={onChange}
      disabled={disabled}
      tall
      uploadImage={async file => {
        const asset = await uploadHandbookAsset(articleId, file)
        return {src: asset.url, alt: asset.filename}
      }}
      extraToolbar={({insertHtml}) => (
        <>
          <Tooltip label={t("handbook.fmt.file")}>
            <ActionIcon
              variant="default"
              size="sm"
              onMouseDown={e => e.preventDefault()}
              onClick={() => fileInput.current?.click()}
            >
              <IconPaperclip size={16} />
            </ActionIcon>
          </Tooltip>
          <input
            ref={fileInput}
            type="file"
            hidden
            onChange={e => {
              const file = e.currentTarget.files?.[0]
              e.currentTarget.value = ""
              if (!file) {
                return
              }
              void (async () => {
                const asset = await uploadHandbookAsset(articleId, file)
                insertHtml(
                  `<a href="${escapeAttr(asset.url)}" target="_blank" rel="noreferrer">${escapeText(asset.filename)}</a>`
                )
              })()
            }}
          />
        </>
      )}
    />
  )
}
