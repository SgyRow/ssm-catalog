import {fileManager} from "@/features/files/fileManager"
import {getDocLastVersion} from "@/features/document/utils"
import type {ClientDocumentVersion} from "@/types"
import type {DocumentVersion} from "@/features/document/types"
import {useEffect} from "react"

type DocVer = ClientDocumentVersion | DocumentVersion

type UUID = string

/**
 * Keeps track of in-flight last-version downloads keyed by `docVerID`, so that
 * concurrent components (Viewer chrome + SelectablePdfPage + thumbnails) do not
 * race on the same API call.
 */
const inflightFetches = new Map<UUID, Promise<void>>()
const lastErrors = new Map<UUID, string>()

export interface EnsureDocVerBufferResult {
  ok: boolean
  error?: string
}

interface EnsureOptions {
  force?: boolean
  signal?: AbortSignal
}

async function ensureDocVerBuffer(
  docVer: DocVer,
  options?: EnsureOptions
): Promise<EnsureDocVerBufferResult> {
  if (fileManager.getByDocVerID(docVer.id)?.buffer && !options?.force) {
    return {ok: true}
  }

  const existing = inflightFetches.get(docVer.id)
  if (existing) {
    await existing
    const hasBuffer = Boolean(fileManager.getByDocVerID(docVer.id)?.buffer)
    return {
      ok: hasBuffer,
      error: hasBuffer ? undefined : lastErrors.get(docVer.id)
    }
  }

  const task = (async () => {
    const {ok, data, error} = await getDocLastVersion(docVer.document_id, {
      signal: options?.signal
    })
    if (!ok || !data) {
      // Log and keep going; callers fall back to rasterised previews.
      console.warn(
        `[useEnsureDocVerBuffer] download failed for ${docVer.document_id}: ${error ?? "unknown"}`
      )
      lastErrors.set(docVer.id, error ?? "Unknown buffer download error")
      return
    }
    const buffer = await data.blob.arrayBuffer()
    fileManager.store({buffer, docVerID: data.docVerID})
    lastErrors.delete(docVer.id)
  })().finally(() => {
    inflightFetches.delete(docVer.id)
  })

  inflightFetches.set(docVer.id, task)
  await task
  const hasBuffer = Boolean(fileManager.getByDocVerID(docVer.id)?.buffer)
  return {ok: hasBuffer, error: hasBuffer ? undefined : lastErrors.get(docVer.id)}
}

/**
 * Makes sure the selected document version's PDF buffer is present in
 * `fileManager`. Safe to call independently of preview generation; the returned
 * promise is shared across hooks so only one HTTP download happens per version.
 *
 * The hook intentionally does NOT block the UI. `SelectablePdfPage` subscribes
 * to `fileManager.subscribeDocVerBuffer` and upgrades from the raster fallback
 * to the canvas+text layer once the buffer arrives.
 */
export default function useEnsureDocVerBuffer(docVer?: DocVer): void {
  useEffect(() => {
    if (!docVer) {
      return
    }
    void ensureDocVerBuffer(docVer)
  }, [docVer?.id, docVer?.document_id])
}

export {ensureDocVerBuffer}
