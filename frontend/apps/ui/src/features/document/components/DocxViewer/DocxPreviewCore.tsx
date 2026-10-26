import {Loader, ScrollArea, Text} from "@mantine/core"
import {renderAsync} from "docx-preview"
import {useEffect, useRef, useState} from "react"
import {useTranslation} from "react-i18next"

import {
  applyDocxZoom,
  configureDocxHyperlinks,
  docxViewerBaseCss,
  normalizeDocxPageLayout,
  syncMantineThemeToIframe
} from "./docxPageLayout"
import {DOCX_VIEWER_PAGE_CLASS} from "./docxViewerConstants"

import classes from "./DocxPreview.module.css"

interface Props {
  objectURL: string
  /** When true, own ScrollArea (legacy page stack). When false, outer container scrolls. */
  embedScroll: boolean
  /** docx-preview root class (sections are `section.{previewClassName}`). */
  previewClassName: string
  wrapClassName?: string
  zoomFactor?: number
  onPagesReady?: (
    count: number,
    sections: HTMLElement[],
    queryRoot: Document
  ) => void
}

function prepareIframeDocument(
  doc: Document,
  previewClassName: string
): HTMLElement {
  doc.open()
  doc.write("<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body></body></html>")
  doc.close()

  const baseStyle = doc.createElement("style")
  baseStyle.setAttribute("data-docx-viewer-base", "")
  baseStyle.textContent = docxViewerBaseCss(previewClassName)
  doc.head.appendChild(baseStyle)
  syncMantineThemeToIframe(doc)

  return doc.body
}

export default function DocxPreviewCore({
  objectURL,
  embedScroll,
  previewClassName,
  wrapClassName,
  zoomFactor = 100,
  onPagesReady
}: Props) {
  const {t} = useTranslation()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const onReadyRef = useRef(onPagesReady)
  onReadyRef.current = onPagesReady
  const zoomRef = useRef(zoomFactor)
  zoomRef.current = zoomFactor
  const [pending, setPending] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) {
      return
    }
    let cancelled = false
    setPending(true)
    setError(null)

    const run = async () => {
      try {
        const r = await fetch(objectURL)
        if (!r.ok) {
          throw new Error(String(r.status))
        }
        const buf = await r.arrayBuffer()
        if (cancelled) {
          return
        }

        const doc = iframe.contentDocument
        if (!doc) {
          throw new Error("iframe document unavailable")
        }

        const body = prepareIframeDocument(doc, previewClassName)

        await renderAsync(buf, body, doc.head, {
          className: previewClassName,
          inWrapper: true,
          breakPages: true,
          ignoreFonts: false,
          ignoreWidth: false,
          ignoreHeight: false,
          experimental: true,
          renderAltChunks: true
        })
        if (cancelled) {
          return
        }

        const pageRoots = normalizeDocxPageLayout(doc, previewClassName)
        pageRoots.forEach(node => node.classList.add(DOCX_VIEWER_PAGE_CLASS))
        configureDocxHyperlinks(doc)
        applyDocxZoom(iframe, previewClassName, zoomRef.current)

        const count = Math.max(1, pageRoots.length)
        onReadyRef.current?.(count, pageRoots, doc)
        setPending(false)
      } catch {
        if (!cancelled) {
          const doc = iframe.contentDocument
          if (doc) {
            onReadyRef.current?.(1, [], doc)
          }
          setError(t("blobPreview.docxError"))
          setPending(false)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
      const doc = iframe.contentDocument
      if (doc) {
        doc.open()
        doc.close()
      }
    }
  }, [objectURL, previewClassName, t])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || pending) {
      return
    }

    const onResize = () =>
      applyDocxZoom(iframe, previewClassName, zoomRef.current)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [pending, objectURL, previewClassName])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || pending) {
      return
    }
    applyDocxZoom(iframe, previewClassName, zoomFactor)
  }, [pending, previewClassName, zoomFactor])

  if (error) {
    return <Text c="red">{error}</Text>
  }

  const inner = (
    <div className={wrapClassName}>
      {pending && <Loader className={classes.docxLoader} />}
      <iframe
        ref={iframeRef}
        title="docx-preview"
        className={classes.docxFrame}
        style={{visibility: pending ? "hidden" : "visible"}}
      />
    </div>
  )

  if (embedScroll) {
    return (
      <ScrollArea style={{maxHeight: "80vh", width: "100%"}} type="auto">
        {inner}
      </ScrollArea>
    )
  }

  return inner
}
