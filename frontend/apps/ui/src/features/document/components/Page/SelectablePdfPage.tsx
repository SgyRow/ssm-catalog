import {fileManager} from "@/features/files/fileManager"
import {
  loadPdfDocumentForDocVer,
  textContentAppearsSearchable
} from "@/features/document/pdf/selectablePdf"
import {Skeleton, Stack} from "@mantine/core"
import {TextLayer} from "pdfjs-dist"
import type {PDFPageProxy, RenderTask} from "pdfjs-dist/types/src/display/api"
import {
  forwardRef,
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react"

import classes from "./SelectablePdfPage.module.css"

type Gate = "loading" | "off" | "on"

function normalizeRotation(deg: number): number {
  return ((deg % 360) + 360) % 360
}

type PdfTextContentLike = {
  items: Array<unknown>
  styles: Record<string, unknown>
  lang?: string
}

type PdfTextItemLike = {
  str?: unknown
  width?: unknown
  height?: unknown
}

function pruneGhostTextSpans(textLayerEl: HTMLDivElement) {
  const spans = Array.from(textLayerEl.querySelectorAll("span"))
  for (const span of spans) {
    const text = (span.textContent ?? "").replace(/\u00A0/g, " ").trim()
    if (!text) {
      span.remove()
      continue
    }
    const rect = span.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      span.remove()
    }
  }
}

interface Props {
  docVerId: string
  pageNumber: number
  angle: number
  zoomFactor: number
  fallbackImageURL: string | undefined
  isImageLoading: boolean
}

/**
 * PDF main preview with selectable text when getTextContent() is meaningful.
 * Falls back to the same raster preview as before when there is no file buffer,
 * no extractable text, or rendering fails. Uses only the in-memory buffer used
 * for thumbnail generation (no extra download_url fetch vs baseline).
 */
const SelectablePdfPage = forwardRef<HTMLDivElement, Props>(
  (
    {docVerId, pageNumber, angle, zoomFactor, fallbackImageURL, isImageLoading},
    ref
  ) => {
    const [gate, setGate] = useState<Gate>("loading")
    const [pdfPaintFailed, setPdfPaintFailed] = useState(false)
    const [innerWidth, setInnerWidth] = useState(0)
    /** Bumps when fileManager gains/updates the PDF buffer for this docVerId (async after first paint). */
    const [docVerBufferRev, setDocVerBufferRev] = useState(0)
    const innerRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const textLayerRef = useRef<HTMLDivElement>(null)
    /** Monotonic generation for text-probe async; only the latest session may call setGate. */
    const gateProbeGenRef = useRef(0)
    /** Monotonic generation for canvas/text-layer render; stale sessions skip DOM/state updates. */
    const pdfRenderGenRef = useRef(0)
    /** Once true for current page session, keep selectable branch stable to avoid loading flicker. */
    const gateLockedOnRef = useRef(false)
    /** Once first canvas paint succeeded, never degrade to fallback for this page session. */
    const firstSuccessfulPaintRef = useRef(false)

    useEffect(() => {
      gateLockedOnRef.current = false
      firstSuccessfulPaintRef.current = false
      setGate("loading")
      setPdfPaintFailed(false)
    }, [docVerId, pageNumber])

    useLayoutEffect(() => {
      const el = innerRef.current
      if (!el) {
        return
      }
      const ro = new ResizeObserver(() => {
        setInnerWidth(el.getBoundingClientRect().width)
      })
      ro.observe(el)
      setInnerWidth(el.getBoundingClientRect().width)
      return () => ro.disconnect()
    }, [gate])

    useEffect(() => {
      return fileManager.subscribeDocVerBuffer(docVerId, () => {
        setDocVerBufferRev(r => r + 1)
      })
    }, [docVerId])

    useEffect(() => {
      const session = ++gateProbeGenRef.current

      const buf = fileManager.getByDocVerID(docVerId)?.buffer
      if (!buf) {
        if (session === gateProbeGenRef.current) {
          if (!gateLockedOnRef.current) {
            setGate("off")
          }
        }
        return
      }
      if (gateLockedOnRef.current) {
        return
      }
      setGate("loading")
      setPdfPaintFailed(false)

      ;(async () => {
        try {
          const doc = await loadPdfDocumentForDocVer(
            docVerId,
            buf,
            docVerBufferRev
          )
          if (session !== gateProbeGenRef.current) {
            return
          }
          const page = await doc.getPage(pageNumber)
          if (session !== gateProbeGenRef.current) {
            return
          }
          const tc = await page.getTextContent()
          if (session !== gateProbeGenRef.current) {
            return
          }
          const searchable = textContentAppearsSearchable(tc)
          if (searchable) {
            gateLockedOnRef.current = true
          }
          setGate(searchable ? "on" : "off")
        } catch {
          if (session === gateProbeGenRef.current) {
            setGate("off")
          }
        }
      })()
    }, [docVerId, pageNumber, docVerBufferRev])

    useEffect(() => {
      if (gate !== "on" || innerWidth < 8) {
        return
      }

      const session = ++pdfRenderGenRef.current
      if (!firstSuccessfulPaintRef.current) {
        setPdfPaintFailed(false)
      }

      const canvas = canvasRef.current
      const textDiv = textLayerRef.current
      if (!canvas || !textDiv) {
        return
      }

      let renderTask: RenderTask | undefined
      let textLayer: TextLayer | undefined
      const rotation = normalizeRotation(angle)

      ;(async () => {
        const buf = fileManager.getByDocVerID(docVerId)?.buffer
        if (!buf || session !== pdfRenderGenRef.current) {
          return
        }

        let page: PDFPageProxy | undefined
        try {
          const doc = await loadPdfDocumentForDocVer(
            docVerId,
            buf,
            docVerBufferRev
          )
          if (session !== pdfRenderGenRef.current) {
            return
          }
          page = await doc.getPage(pageNumber)
          if (session !== pdfRenderGenRef.current) {
            return
          }
          const baseViewport = page.getViewport({scale: 1, rotation})
          // Intentionally omit devicePixelRatio scaling to match the simple raster preview path and limit work on zoom/resize.
          const scale = innerWidth / baseViewport.width
          const viewport = page.getViewport({scale, rotation})

          const ctx = canvas.getContext("2d")
          if (!ctx || session !== pdfRenderGenRef.current) {
            return
          }

          canvas.width = Math.max(1, Math.round(viewport.width))
          canvas.height = Math.max(1, Math.round(viewport.height))
          canvas.style.width = `${viewport.width}px`
          canvas.style.height = `${viewport.height}px`
          textDiv.style.width = `${viewport.width}px`
          textDiv.style.height = `${viewport.height}px`
          textDiv.replaceChildren()

          // pdf.js 5 TextLayer + setLayerDimensions() size spans via
          // calc(var(--total-scale-factor) * …). Without these custom properties the
          // layer has invalid dimensions/font sizes and selection does not work.
          const innerEl = innerRef.current
          if (innerEl && session === pdfRenderGenRef.current) {
            const userUnit = viewport.userUnit ?? 1
            innerEl.style.setProperty(
              "--scale-factor",
              String(viewport.scale)
            )
            innerEl.style.setProperty("--user-unit", String(userUnit))
            innerEl.style.setProperty(
              "--total-scale-factor",
              `calc(var(--scale-factor) * var(--user-unit))`
            )
            innerEl.style.setProperty("--scale-round-x", "1px")
            innerEl.style.setProperty("--scale-round-y", "1px")
          }

          renderTask = page.render({canvasContext: ctx, viewport})
          await renderTask.promise
          if (session !== pdfRenderGenRef.current) {
            return
          }
          firstSuccessfulPaintRef.current = true

          const textContent = (await page.getTextContent()) as PdfTextContentLike
          if (session !== pdfRenderGenRef.current) {
            return
          }

          textLayer = new TextLayer({
            textContentSource: textContent,
            container: textDiv,
            viewport
          })
          await textLayer.render()
          if (session === pdfRenderGenRef.current) {
            pruneGhostTextSpans(textDiv)
          }
        } catch (err) {
          if (session === pdfRenderGenRef.current) {
            // pdf.js throws cancellation errors when a render task is superseded
            // by a newer one (resize/zoom/layout updates). Treat as normal flow.
            const normalizedErr = err as {name?: string} | undefined
            const isRenderCancelled =
              normalizedErr?.name === "RenderingCancelledException" ||
              normalizedErr?.name === "AbortError"
            if (!isRenderCancelled && !firstSuccessfulPaintRef.current) {
              setPdfPaintFailed(true)
            }
          }
        } finally {
          if (page) {
            page.cleanup()
          }
        }
      })()

      return () => {
        renderTask?.cancel()
        textLayer?.cancel()
        textDiv.replaceChildren()
        const innerEl = innerRef.current
        if (innerEl) {
          innerEl.style.removeProperty("--scale-factor")
          innerEl.style.removeProperty("--total-scale-factor")
          innerEl.style.removeProperty("--scale-round-x")
          innerEl.style.removeProperty("--scale-round-y")
          innerEl.style.removeProperty("--user-unit")
        }
      }
    }, [gate, innerWidth, pageNumber, angle, docVerId, docVerBufferRev])

    if (gate === "loading") {
      return (
        <div ref={ref} className={`page ${classes.pageWrap}`}>
          <Stack gap="xs">
            <Skeleton height={800} />
            <div>{pageNumber}</div>
          </Stack>
        </div>
      )
    }

    // gate "off" / paint failure: raster <img> preview only (no text layer).
    // Visually distinct from canvas+textLayer path: no .root/.inner stack, uses zoom % on <img>.
    if (gate === "off" || pdfPaintFailed) {
      if (!fallbackImageURL) {
        return (
          <div ref={ref} className={`page ${classes.pageWrap}`}>
            <Stack gap="xs">
              {isImageLoading ? (
                <Skeleton height={800} />
              ) : (
                <div>No Image URL</div>
              )}
              <div>{pageNumber}</div>
            </Stack>
          </div>
        )
      }

      return (
        <div ref={ref} className={`page ${classes.pageWrap}`}>
          <Stack gap="xs">
            <img
              alt=""
              style={{
                transform: `rotate(${angle}deg)`,
                width: `${zoomFactor}%`
              }}
              src={fallbackImageURL}
            />
            <div>{pageNumber}</div>
          </Stack>
        </div>
      )
    }

    const showPdfLayers = innerWidth >= 8

    return (
      <div ref={ref} className={`page ${classes.pageWrap}`}>
        <Stack gap="xs">
          <div
            className={classes.root}
            style={{width: `${zoomFactor}%`, maxWidth: "100%", margin: "0 auto"}}
          >
            <div className={classes.scaled}>
              <div className={classes.inner} ref={innerRef}>
                {showPdfLayers ? (
                  <>
                    <canvas ref={canvasRef} className={classes.canvasLayer} />
                    <div
                      ref={textLayerRef}
                      className={`textLayer ${classes.textLayer}`}
                    />
                  </>
                ) : (
                  <Skeleton height={800} className={classes.measureSkeleton} />
                )}
              </div>
            </div>
          </div>
          <div>{pageNumber}</div>
        </Stack>
      </div>
    )
  }
)

SelectablePdfPage.displayName = "SelectablePdfPage"

export default memo(SelectablePdfPage)
