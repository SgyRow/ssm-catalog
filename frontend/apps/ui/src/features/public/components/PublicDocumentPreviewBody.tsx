import {Box, Loader, Stack, Text} from "@mantine/core"
import {useEffect, useRef, useState} from "react"
import {useTranslation} from "react-i18next"

import DocxPreviewCore from "@/features/document/components/DocxViewer/DocxPreviewCore"
import docxClasses from "@/features/document/components/DocxViewer/DocxPreview.module.css"
import {DOCX_VIEWER_CLASS} from "@/features/document/components/DocxViewer/docxViewerConstants"
import classes from "./PublicDocumentPreviewBody.module.css"
import {TextStandalonePreview} from "@/features/document/components/Page/TextStandalonePreview"
import {
  getBlobViewerCategory,
  getViewerChromeKind,
  guessMimeTypeFromFileName
} from "@/features/document/documentPreview"

import {rtfToPlainText} from "@/utils/rtfToPlainText"

type Props = {
  downloadUrl: string
  fileName: string
}

const PREVIEW_HEIGHT = "75vh"

function ScrollPane({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <Box
      className={`${classes.scrollPane} ${className ?? ""}`}
      style={{height: PREVIEW_HEIGHT, border: "1px solid #ccc"}}
    >
      {children}
    </Box>
  )
}

export default function PublicDocumentPreviewBody({
  downloadUrl,
  fileName
}: Props) {
  const {t} = useTranslation()
  const objectUrlRef = useRef<string>()
  const [objectURL, setObjectURL] = useState<string>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [htmlContent, setHtmlContent] = useState<string | null>(null)
  const chrome = getViewerChromeKind(fileName)
  const category = getBlobViewerCategory(fileName)

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setError(undefined)
    setObjectURL(undefined)
    setTextContent(null)
    setHtmlContent(null)

    fetch(downloadUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(String(response.status))
        }
        return response.arrayBuffer()
      })
      .then(buffer => {
        if (cancelled) {
          return
        }
        const mime = guessMimeTypeFromFileName(fileName)
        const nextUrl = URL.createObjectURL(new Blob([buffer], {type: mime}))
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current)
        }
        objectUrlRef.current = nextUrl
        setObjectURL(nextUrl)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setError(t("viewer.preview_load_failed"))
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [downloadUrl, fileName, t])

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = undefined
      }
    }
  }, [])

  useEffect(() => {
    if (!objectURL || (category !== "text" && category !== "html" && category !== "rtf")) {
      return
    }

    let cancelled = false
    fetch(objectURL)
      .then(response => {
        if (!response.ok) {
          throw new Error(String(response.status))
        }
        return response.text()
      })
      .then(body => {
        if (cancelled) {
          return
        }
        if (category === "html") {
          setHtmlContent(body)
        } else if (category === "rtf") {
          setTextContent(rtfToPlainText(body))
        } else {
          setTextContent(body)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(t("blobPreview.loadError"))
        }
      })

    return () => {
      cancelled = true
    }
  }, [objectURL, category, t])

  if (loading) {
    return <Loader p="md" />
  }

  if (error || !objectURL) {
    return (
      <Text p="md" c="dimmed">
        {error ?? t("public.browse.forbidden")}
      </Text>
    )
  }

  if (chrome === "native-pdf") {
    return (
      <iframe
        title={t("public.document.preview")}
        src={objectURL}
        className={classes.frame}
        style={{height: PREVIEW_HEIGHT}}
      />
    )
  }

  if (chrome === "docx") {
    return (
      <ScrollPane className={classes.docxScrollPane}>
        <DocxPreviewCore
          objectURL={objectURL}
          embedScroll={false}
          previewClassName={DOCX_VIEWER_CLASS}
          wrapClassName={`${docxClasses.docxHost} ${docxClasses.docxPane}`}
        />
      </ScrollPane>
    )
  }

  if (category === "video") {
    return (
      <ScrollPane>
        <Box className={classes.mediaWrap}>
          <video controls src={objectURL} className={classes.videoStandalone}>
            {t("blobPreview.videoUnsupported")}
          </video>
        </Box>
      </ScrollPane>
    )
  }

  if (category === "audio") {
    return (
      <ScrollPane>
        <Box className={classes.mediaWrap}>
          <audio controls src={objectURL} className={classes.audioStandalone}>
            {t("blobPreview.audioUnsupported")}
          </audio>
        </Box>
      </ScrollPane>
    )
  }

  if (category === "text" && textContent === null) {
    return (
      <ScrollPane>
        <Loader p="md" />
      </ScrollPane>
    )
  }

  if (category === "text" && textContent !== null) {
    return (
      <ScrollPane>
        <TextStandalonePreview mode="pane">{textContent}</TextStandalonePreview>
      </ScrollPane>
    )
  }

  if (category === "rtf" && textContent === null) {
    return (
      <ScrollPane>
        <Loader p="md" />
      </ScrollPane>
    )
  }

  if (category === "rtf" && textContent !== null) {
    return (
      <ScrollPane>
        <TextStandalonePreview mode="pane">{textContent}</TextStandalonePreview>
      </ScrollPane>
    )
  }

  if (category === "html" && htmlContent === null) {
    return (
      <ScrollPane>
        <Loader p="md" />
      </ScrollPane>
    )
  }

  if (category === "html" && htmlContent !== null) {
    return (
      <ScrollPane>
        <iframe
          title={fileName || "html"}
          srcDoc={htmlContent}
          sandbox=""
          className={classes.htmlIframe}
        />
      </ScrollPane>
    )
  }

  if (category === "word-doc") {
    return (
      <ScrollPane>
        <Stack gap="sm" p="md">
          <Text>{t("blobPreview.legacyDoc")}</Text>
          <Text size="sm" c="dimmed">
            {t("blobPreview.downloadHint")}
          </Text>
        </Stack>
      </ScrollPane>
    )
  }

  return (
    <ScrollPane>
      <Stack gap="sm" p="md">
        <Text>{t("blobPreview.unsupported", {name: fileName || "file"})}</Text>
        <Text size="sm" c="dimmed">
          {t("blobPreview.downloadHint")}
        </Text>
      </Stack>
    </ScrollPane>
  )
}
