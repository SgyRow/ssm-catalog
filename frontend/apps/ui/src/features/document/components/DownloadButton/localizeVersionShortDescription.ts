import type {TFunction} from "i18next"

const PAGES_MOVED_IN = /^(\d+) page\(s\) moved in$/
const PAGES_MOVED_OUT = /^(\d+) page\(s\) moved out$/
const PAGES_REPLACED = /^(\d+) page\(s\) replaced$/
const CONVERT_TO_PDF = /^(.+) -> pdf$/

const MIME_TYPE_LABEL_KEYS: Record<string, string> = {
  "application/pdf": "library.filetype_pdf-pages",
  "application/msword": "library.filetype_word-doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "library.filetype_docx",
  "text/plain": "library.filetype_text",
  "text/html": "library.filetype_html"
}

function mimeTypeLabel(mime: string, t: TFunction): string | undefined {
  const normalized = mime.toLowerCase()
  const key = MIME_TYPE_LABEL_KEYS[normalized]
  if (key) {
    return t(key)
  }
  if (normalized.startsWith("image/")) {
    return t("library.filetype_image")
  }
  if (normalized.startsWith("video/")) {
    return t("library.filetype_video")
  }
  if (normalized.startsWith("audio/")) {
    return t("library.filetype_audio")
  }
  return undefined
}

export function localizeVersionShortDescription(
  shortDescription: string | null | undefined,
  t: TFunction
): string {
  if (!shortDescription) {
    return ""
  }

  if (shortDescription === "Original") {
    return t("downloadButton.versionDescription.original")
  }

  if (shortDescription === "docx -> pdf") {
    return t("downloadButton.versionDescription.docxToPdf")
  }

  const movedIn = shortDescription.match(PAGES_MOVED_IN)
  if (movedIn) {
    return t("downloadButton.versionDescription.pagesMovedIn", {
      count: Number(movedIn[1])
    })
  }

  const movedOut = shortDescription.match(PAGES_MOVED_OUT)
  if (movedOut) {
    return t("downloadButton.versionDescription.pagesMovedOut", {
      count: Number(movedOut[1])
    })
  }

  const replaced = shortDescription.match(PAGES_REPLACED)
  if (replaced) {
    return t("downloadButton.versionDescription.pagesReplaced", {
      count: Number(replaced[1])
    })
  }

  const toPdf = shortDescription.match(CONVERT_TO_PDF)
  if (toPdf) {
    return t("downloadButton.versionDescription.convertToPdf", {
      source: toPdf[1]
    })
  }

  const mimeLabel = mimeTypeLabel(shortDescription, t)
  if (mimeLabel) {
    return mimeLabel
  }

  return shortDescription
}
