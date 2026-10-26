import {useAppSelector} from "@/app/hooks"
import {
  getBlobViewerCategory,
  type BlobViewerCategory
} from "@/features/document/documentPreview"
import {selectBestImageByPageId} from "@/features/document/store/selectors"
import {Box, Loader, Stack, Text} from "@mantine/core"
import {useEffect, useState, type ReactNode} from "react"
import {useTranslation} from "react-i18next"

import {rtfToPlainText} from "@/utils/rtfToPlainText"

import classes from "./BlobMediaPage.module.css"
import {TextStandalonePreview} from "./TextStandalonePreview"

export type BlobMediaPageLayout = "pageList" | "standalone"

interface Props {
  pageID: string
  pageNumber: number
  zoomFactor: number
  fileName: string | undefined
  /** Optional direct file object URL fallback (used when page preview URL is unavailable). */
  objectURLOverride?: string
  /** pageList: inside PDF-style canvas (gray background, zoom). standalone: full preview pane. */
  layout?: BlobMediaPageLayout
  /** Available viewer height in px for standalone fit-to-viewport media. */
  availableHeight?: number
}

function PageChrome({
  layout,
  pageNumber,
  children
}: {
  layout: BlobMediaPageLayout
  pageNumber: number
  children: ReactNode
}) {
  const stackClass = layout === "standalone" ? undefined : "page"
  return (
    <Stack className={stackClass} gap="xs">
      {children}
      {layout === "pageList" && <Text size="sm">{pageNumber}</Text>}
    </Stack>
  )
}

export default function BlobMediaPage({
  pageID,
  pageNumber,
  zoomFactor,
  fileName,
  objectURLOverride,
  layout = "pageList",
  availableHeight
}: Props) {
  const {t} = useTranslation()
  const previewObjectURL = useAppSelector(s => selectBestImageByPageId(s, pageID))
  const category = getBlobViewerCategory(fileName)
  const objectURL =
    category === "pdf-pages"
      ? previewObjectURL ?? objectURLOverride
      : objectURLOverride ?? previewObjectURL
  const [textContent, setTextContent] = useState<string | null>(null)
  const [htmlContent, setHtmlContent] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setTextContent(null)
    setHtmlContent(null)
    setLoadError(null)
    if (!objectURL || category === "pdf-pages") {
      return
    }

    if (category === "text" || category === "html" || category === "rtf") {
      setPending(true)
      fetch(objectURL)
        .then(r => {
          if (!r.ok) {
            throw new Error(String(r.status))
          }
          return r.text()
        })
        .then(body => {
          if (category === "html") {
            setHtmlContent(body)
          } else if (category === "rtf") {
            setTextContent(rtfToPlainText(body))
          } else {
            setTextContent(body)
          }
          setPending(false)
        })
        .catch(() => {
          setLoadError(t("blobPreview.loadError"))
          setPending(false)
        })
    }
  }, [objectURL, category, t])

  if (!objectURL) {
    return (
      <PageChrome layout={layout} pageNumber={pageNumber}>
        <Loader />
      </PageChrome>
    )
  }

  if (category === "word-doc") {
    return (
      <PageChrome layout={layout} pageNumber={pageNumber}>
        <Stack gap="sm">
          <Text>{t("blobPreview.legacyDoc")}</Text>
          <Text size="sm" c="dimmed">
            {t("blobPreview.downloadHint")}
          </Text>
        </Stack>
      </PageChrome>
    )
  }

  if (pending && (category === "text" || category === "html" || category === "rtf")) {
    return (
      <PageChrome layout={layout} pageNumber={pageNumber}>
        <Loader />
      </PageChrome>
    )
  }

  if (loadError) {
    return (
      <PageChrome layout={layout} pageNumber={pageNumber}>
        <Text c="red">{loadError}</Text>
      </PageChrome>
    )
  }

  return (
    <PageChrome layout={layout} pageNumber={pageNumber}>
      <BlobInner
        category={category}
        objectURL={objectURL}
        zoomFactor={zoomFactor}
        textContent={textContent}
        htmlContent={htmlContent}
        fileName={fileName}
        layout={layout}
        availableHeight={availableHeight}
      />
    </PageChrome>
  )
}

function BlobInner({
  category,
  objectURL,
  zoomFactor,
  textContent,
  htmlContent,
  fileName,
  layout,
  availableHeight
}: {
  category: BlobViewerCategory
  objectURL: string
  zoomFactor: number
  textContent: string | null
  htmlContent: string | null
  fileName: string | undefined
  layout: BlobMediaPageLayout
  availableHeight?: number
}) {
  const {t} = useTranslation()
  const embedScroll = layout === "pageList"
  const widthStyle = {width: `${zoomFactor}%`, maxWidth: "100%"}

  if (category === "video") {
    const video =
      layout === "standalone" ? (
        <video controls src={objectURL} className={classes.videoStandalone}>
          {t("blobPreview.videoUnsupported")}
        </video>
      ) : (
        <video controls src={objectURL} style={widthStyle}>
          {t("blobPreview.videoUnsupported")}
        </video>
      )
    return (
      <Box className={layout === "standalone" ? classes.mediaWrap : undefined}>
        {video}
      </Box>
    )
  }

  if (category === "audio") {
    return (
      <Box className={layout === "standalone" ? classes.mediaWrap : undefined}>
        <audio
          controls
          src={objectURL}
          className={
            layout === "standalone" ? classes.audioStandalone : undefined
          }
          style={layout === "pageList" ? {width: "100%"} : undefined}
        >
          {t("blobPreview.audioUnsupported")}
        </audio>
      </Box>
    )
  }

  if (category === "image") {
    const imageStyle =
      layout === "standalone"
        ? {
            display: "block",
            width: "auto",
            height: "auto",
            maxWidth: "100%",
            maxHeight:
              availableHeight && availableHeight > 120
                ? `${availableHeight - 80}px`
                : "70vh",
            margin: "0 auto"
          }
        : widthStyle
    return <img alt="" src={objectURL} style={imageStyle} />
  }

  if (category === "pdf-pages") {
    const imageStyle =
      layout === "standalone"
        ? {
            display: "block",
            width: "auto",
            height: "auto",
            maxWidth: "100%",
            maxHeight:
              availableHeight && availableHeight > 120
                ? `${availableHeight - 80}px`
                : "70vh",
            margin: "0 auto"
          }
        : widthStyle
    return <img alt="" src={objectURL} style={imageStyle} />
  }

  if ((category === "text" || category === "rtf") && textContent !== null) {
    return (
      <TextStandalonePreview mode={embedScroll ? "embed" : "pane"}>
        {textContent}
      </TextStandalonePreview>
    )
  }

  if (category === "html" && htmlContent !== null) {
    return (
      <iframe
        title={fileName || "html"}
        srcDoc={htmlContent}
        sandbox=""
        className={layout === "standalone" ? classes.htmlIframe : undefined}
        style={
          embedScroll
            ? {...widthStyle, minHeight: 480, border: "1px solid #ccc"}
            : undefined
        }
      />
    )
  }

  return (
    <Stack gap="sm">
      <Text>{t("blobPreview.unsupported", {name: fileName || "file"})}</Text>
      <Text size="sm" c="dimmed">
        {t("blobPreview.downloadHint")}
      </Text>
    </Stack>
  )
}
