import client from "@/httpClient"
import {ClientDocumentVersion, DocVerShort} from "@/types"
import {UUID} from "@/types.d/common"
import axios from "axios"
import {
  DOC_VER_PAGINATION_PAGE_BATCH_SIZE,
  DOC_VER_PAGINATION_THUMBNAIL_BATCH_SIZE
} from "./constants"
import {DocumentVersion} from "./types"

export function clientDVFromDV(v: DocumentVersion): ClientDocumentVersion {
  const serverPages = v.pages.map(p => {
    return {id: p.id, number: p.number, angle: 0, text: p.text}
  })

  let ver: ClientDocumentVersion = {
    id: v.id,
    lang: v.lang,
    number: v.number,
    document_id: v.document_id,
    size: v.size,
    short_description: v.short_description,
    file_name: v.file_name,
    pages: serverPages.map(p => ({...p})),
    initial_pages: serverPages.map(p => ({...p})),
    pagination: {
      page_number: 1,
      per_page: DOC_VER_PAGINATION_PAGE_BATCH_SIZE
    },
    thumbnailsPagination: {
      page_number: 1,
      per_page: DOC_VER_PAGINATION_THUMBNAIL_BATCH_SIZE
    }
  }

  return ver
}

export async function rotateImageObjectURL(
  objectURL: string,
  angleDegrees: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const angle = ((angleDegrees % 360) + 360) % 360
      const radians = (angle * Math.PI) / 180

      let canvas = document.createElement("canvas")
      let ctx = canvas.getContext("2d")
      if (!ctx) return reject(new Error("Failed to get canvas context"))

      // Determine new canvas dimensions
      if (angle === 90 || angle === 270) {
        canvas.width = img.height
        canvas.height = img.width
      } else {
        canvas.width = img.width
        canvas.height = img.height
      }

      // Move to center and rotate
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate(radians)
      ctx.drawImage(img, -img.width / 2, -img.height / 2)

      // Export rotated image as Blob
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error("Failed to convert canvas to Blob"))
        resolve(blob)
      }, "image/png")
    }

    img.onerror = () => reject(new Error("Image failed to load"))
    img.src = objectURL
  })
}

interface DocData {
  blob: Blob
  docVerID: UUID
}

interface ClientReturn {
  ok: boolean
  error?: string
  data?: DocData
}

interface GetDocLastVersionOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

export async function getDocLastVersion(
  docID: UUID,
  options?: GetDocLastVersionOptions
): Promise<ClientReturn> {
  const timeoutMs = options?.timeoutMs ?? 15000
  const start = performance.now()
  try {
    const metadataStart = performance.now()
    let resp = await client.get(`/api/documents/${docID}/last-version/`, {
      signal: options?.signal,
      timeout: timeoutMs
    })
    const metadataMs = performance.now() - metadataStart

    if (resp.status !== 200) {
      return {
        ok: false,
        error: `Error downloading URL for ${docID}: ${resp.status}`
      }
    }

    const docVer: DocVerShort = resp.data

    const downloadStart = performance.now()
    resp = await client.get(docVer.download_url, {
      responseType: "blob",
      signal: options?.signal,
      timeout: timeoutMs
    })
    const downloadMs = performance.now() - downloadStart
    if (resp.status !== 200) {
      return {
        ok: false,
        error: `Error downloading file from ${docVer.download_url}: ${resp.status}`
      }
    }

    console.info(
      `[preview-metric] getDocLastVersion doc=${docID} meta_ms=${metadataMs.toFixed(2)} download_ms=${downloadMs.toFixed(2)} total_ms=${(performance.now() - start).toFixed(2)} blob_bytes=${resp.data.size ?? 0}`
    )
    return {ok: true, data: {docVerID: docVer.id, blob: resp.data}}
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const cancelled = error.code === "ERR_CANCELED"
      const timeout = error.code === "ECONNABORTED"
      return {
        ok: false,
        error: cancelled
          ? "Request cancelled"
          : timeout
            ? "Request timeout"
            : `Request failed: ${error.response?.status || "Network error"} - ${error.message}`
      }
    }
    return {
      ok: false,
      error: `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`
    }
  }
}
