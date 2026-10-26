/**
 * Cached PDF.js document handles for selectable preview.
 * Uses the same in-memory buffer as raster preview generation (fileManager), not download_url
 * in the browser, so signed URLs are not opened separately and we do not add network when
 * the file is already loaded for thumbnails.
 */
import "@/utils/pdf"
import * as pdfjsLib from "pdfjs-dist"
import type {PDFDocumentProxy} from "pdfjs-dist/types/src/display/api"

/** Keyed by docVerId + buffer revision so a replaced fileManager buffer does not reuse a stale PDF.js document. */
const docCache = new Map<string, PDFDocumentProxy>()
const inflightLoad = new Map<string, Promise<PDFDocumentProxy>>()
/** Latest `bufferRev` requested per docVerId; completions for older revs must not write to `docCache`. */
const lastRequestedBufferRevByDocVer = new Map<string, number>()

function cacheKey(docVerId: string, bufferRev: number): string {
  return `${docVerId}\0${bufferRev}`
}

function parseCacheKey(key: string): {docVerId: string; rev: number} | null {
  const i = key.indexOf("\0")
  if (i === -1) {
    return null
  }
  const rev = Number(key.slice(i + 1))
  if (!Number.isFinite(rev)) {
    return null
  }
  return {docVerId: key.slice(0, i), rev}
}

/** Drop cached PDF.js docs for this version id except the entry for `keepKey` (handles non-monotonic bufferRev, e.g. remount reset). */
function evictOtherCachedDocsForDocVer(docVerId: string, keepKey: string) {
  for (const k of [...docCache.keys()]) {
    const p = parseCacheKey(k)
    if (!p || p.docVerId !== docVerId || k === keepKey) {
      continue
    }
    docCache.get(k)?.destroy()
    docCache.delete(k)
  }
}

/** Remove in-flight loads for strictly older buffer revisions only (do not cancel a newer rev still loading). */
function evictOlderInflightLoads(docVerId: string, keepRev: number) {
  for (const k of [...inflightLoad.keys()]) {
    const p = parseCacheKey(k)
    if (!p || p.docVerId !== docVerId || p.rev >= keepRev) {
      continue
    }
    inflightLoad.delete(k)
  }
}

/** PDF.js text content item with a string `str` field. */
function isPdfTextItem(item: unknown): item is {str: string} {
  if (typeof item !== "object" || item === null) {
    return false
  }
  if (!("str" in item)) {
    return false
  }
  return typeof (item as {str?: unknown}).str === "string"
}

/**
 * Gate for selectable preview: prefer evidence from PDF getTextContent(), not OCR metadata alone,
 * so born-digital PDFs with extractable text qualify even when page-level OCR fields are empty.
 */
export function textContentAppearsSearchable(content: {
  items: Iterable<unknown>
}): boolean {
  let chars = 0
  for (const item of content.items) {
    if (!isPdfTextItem(item)) {
      continue
    }
    const s = item.str.replace(/\s/g, "")
    chars += s.length
    if (chars >= 12) {
      return true
    }
  }
  return false
}

export async function loadPdfDocumentForDocVer(
  docVerId: string,
  buffer: ArrayBuffer,
  bufferRev = 0
): Promise<PDFDocumentProxy> {
  const key = cacheKey(docVerId, bufferRev)
  lastRequestedBufferRevByDocVer.set(docVerId, bufferRev)

  const hit = docCache.get(key)
  if (hit) {
    return hit
  }

  const pending = inflightLoad.get(key)
  if (pending) {
    return pending
  }

  // Copy: pdf.js may transfer the buffer to the worker; fileManager keeps the original for previews.
  const data = buffer.slice(0)
  const task = pdfjsLib
    .getDocument({data})
    .promise.then(doc => {
      if (lastRequestedBufferRevByDocVer.get(docVerId) !== bufferRev) {
        doc.destroy()
        inflightLoad.delete(key)
        throw new Error("Stale PDF document load")
      }
      evictOtherCachedDocsForDocVer(docVerId, key)
      evictOlderInflightLoads(docVerId, bufferRev)
      docCache.set(key, doc)
      inflightLoad.delete(key)
      return doc
    })
    .catch(err => {
      inflightLoad.delete(key)
      throw err
    })

  inflightLoad.set(key, task)
  return task
}
