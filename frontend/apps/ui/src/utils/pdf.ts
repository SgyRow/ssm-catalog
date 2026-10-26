import * as pdfjsLib from "pdfjs-dist"
// Same-origin worker from the installed pdfjs-dist (avoids CDN blocks and version skew vs unpkg).
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"

// In production behind nginx/auth gateway, use a stable .js path to avoid
// strict module MIME issues with hashed .mjs asset names.
const workerSrc =
  import.meta.env.PROD && typeof window !== "undefined"
    ? `${window.location.origin}/pdf.worker.min.js`
    : pdfWorkerUrl

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

interface GeneratePdfBatchPreviewArgs {
  cacheKey: string
  buffer: ArrayBuffer
  width: number
  pageNumbers: number[]
  concurrency?: number
}

interface GeneratePreviewArgs {
  cacheKey?: string
  file: File
  width: number
  pageNumber: number
}

interface CachedPdfDocument {
  docPromise: Promise<pdfjsLib.PDFDocumentProxy>
  disposeTimer?: number
}

const PDF_CACHE_TTL_MS = 30_000
const pdfDocCache = new Map<string, CachedPdfDocument>()

function cachePdfDocument(
  cacheKey: string,
  docPromiseFactory: () => Promise<pdfjsLib.PDFDocumentProxy>
): Promise<pdfjsLib.PDFDocumentProxy> {
  const existing = pdfDocCache.get(cacheKey)
  if (existing) {
    if (existing.disposeTimer) {
      clearTimeout(existing.disposeTimer)
      existing.disposeTimer = undefined
    }
    return existing.docPromise
  }

  const docPromise = docPromiseFactory()
  const entry: CachedPdfDocument = {docPromise}
  pdfDocCache.set(cacheKey, entry)
  return docPromise
}

async function scheduleDispose(
  cacheKey: string,
  pdfDocument: pdfjsLib.PDFDocumentProxy
): Promise<void> {
  const entry = pdfDocCache.get(cacheKey)
  if (!entry) {
    return
  }
  if (entry.disposeTimer) {
    clearTimeout(entry.disposeTimer)
  }
  entry.disposeTimer = window.setTimeout(() => {
    void pdfDocument.destroy().catch(() => undefined)
    pdfDocCache.delete(cacheKey)
  }, PDF_CACHE_TTL_MS)
}

async function renderPageToObjectUrl(
  pdfDocument: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  width: number
): Promise<string> {
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("Could not get canvas 2D context")
  }

  const page = await pdfDocument.getPage(pageNumber)
  const originalViewport = page.getViewport({scale: 1.0})
  const scale = width / originalViewport.width
  const scaledViewport = page.getViewport({scale})

  canvas.width = scaledViewport.width
  canvas.height = scaledViewport.height

  await page
    .render({
      canvasContext: context,
      viewport: scaledViewport
    })
    .promise

  const outputType = width <= 320 ? "image/jpeg" : "image/webp"
  const outputQuality = width <= 320 ? 0.72 : 0.78
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error("Failed to create blob from canvas"))
      }
    }, outputType, outputQuality)
  })

  return URL.createObjectURL(blob)
}

async function generatePdfBatchPreviews({
  cacheKey,
  buffer,
  width,
  pageNumbers,
  concurrency = 2
}: GeneratePdfBatchPreviewArgs): Promise<Record<number, string>> {
  const result: Record<number, string> = {}
  const startedAt = performance.now()
  if (pageNumbers.length === 0) {
    return result
  }
  try {
    const parseStartedAt = performance.now()
    const pdfDocument = await cachePdfDocument(cacheKey, async () => {
      // pdf.js may transfer/consume passed ArrayBuffer in worker mode.
      // Keep fileManager buffer reusable by passing an isolated copy.
      const data = new Uint8Array(buffer.slice(0))
      const loadingTask = pdfjsLib.getDocument({data})
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("PDF loading timeout")), 20000)
      })
      return Promise.race([loadingTask.promise, timeoutPromise])
    })
    const parseMs = performance.now() - parseStartedAt

    let cursor = 0
    const workerCount = Math.max(1, Math.min(concurrency, pageNumbers.length, 2))
    const workers = Array.from({length: workerCount}, async () => {
      while (cursor < pageNumbers.length) {
        const ownIndex = cursor
        cursor += 1
        const pageNumber = pageNumbers[ownIndex]
        result[pageNumber] = await renderPageToObjectUrl(
          pdfDocument,
          pageNumber,
          width
        )
      }
    })
    await Promise.all(workers)
    const totalMs = performance.now() - startedAt
    console.info(
      `[preview-metric] pdf_batch_render cache_key=${cacheKey} pages=${pageNumbers.length} parse_ms=${parseMs.toFixed(2)} total_ms=${totalMs.toFixed(2)}`
    )
    await scheduleDispose(cacheKey, pdfDocument)
    return result
  } catch (error) {
    const detail =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    console.error(`[pdf-preview] Error generating PDF preview: ${detail}`)
    // Fallback: recover by sequential rendering to avoid hard viewer stalls.
    const fallbackResult: Record<number, string> = {}
    try {
      const pdfDocument = await cachePdfDocument(`${cacheKey}-fallback`, async () => {
        const data = new Uint8Array(buffer.slice(0))
        const loadingTask = pdfjsLib.getDocument({data})
        return loadingTask.promise
      })
      for (const pageNumber of pageNumbers) {
        fallbackResult[pageNumber] = await renderPageToObjectUrl(
          pdfDocument,
          pageNumber,
          width
        )
      }
      const totalMs = performance.now() - startedAt
      console.info(
        `[preview-metric] pdf_batch_fallback pages=${pageNumbers.length} total_ms=${totalMs.toFixed(2)}`
      )
      await scheduleDispose(`${cacheKey}-fallback`, pdfDocument)
      return fallbackResult
    } catch (fallbackError) {
      const fallbackDetail =
        fallbackError instanceof Error
          ? `${fallbackError.name}: ${fallbackError.message}`
          : String(fallbackError)
      console.error(`[pdf-preview] Fallback failed: ${fallbackDetail}`)
      throw fallbackError
    }
  }
}

export {generatePdfBatchPreviews}
export async function generatePreview({
  cacheKey = "single-preview",
  file,
  width,
  pageNumber
}: GeneratePreviewArgs): Promise<string> {
  const rendered = await generatePdfBatchPreviews({
    cacheKey,
    buffer: await file.arrayBuffer(),
    width,
    pageNumbers: [pageNumber],
    concurrency: 1
  })
  const objectURL = rendered[pageNumber]
  if (!objectURL) {
    throw new Error(`Could not render page ${pageNumber}`)
  }
  return objectURL
}
