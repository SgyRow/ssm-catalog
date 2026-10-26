import {useAppDispatch} from "@/app/hooks"
import useAreAllPreviewsAvailable from "@/features/document/hooks/useAreAllPreviewsAvailable"
import {ensureDocVerBuffer} from "@/features/document/hooks/useEnsureDocVerBuffer"
import {generatePreviews} from "@/features/document/store/imageObjectsSlice"
import {fileManager} from "@/features/files/fileManager"
import {ClientDocumentVersion} from "@/types"
import {ImageSize} from "@/types.d/common"
import {useCallback, useEffect, useState} from "react"

interface Args {
  docVer?: ClientDocumentVersion
  pageNumber: number
  pageSize: number
  imageSize: ImageSize
}

const inflightBootstrapByDocVer = new Set<string>()

export interface PreviewBootstrapState {
  allPreviewsAreAvailable: boolean
  isBootstrapping: boolean
  error?: string
  retry: () => void
}

export default function useGeneratePreviews({
  docVer,
  pageSize,
  pageNumber,
  imageSize
}: Args): PreviewBootstrapState {
  const dispatch = useAppDispatch()
  const [retryTick, setRetryTick] = useState(0)
  const [isBootstrapping, setIsBootstrapping] = useState(false)
  const [error, setError] = useState<string>()
  const [activeBootstrapKey, setActiveBootstrapKey] = useState<string>()
  const allPreviewsAreAvailable = useAreAllPreviewsAvailable({
    docVer,
    pageSize,
    pageNumber,
    imageSize
  })

  const retry = useCallback(() => {
    setError(undefined)
    setRetryTick(v => v + 1)
  }, [])

  useEffect(() => {
    if (!docVer || allPreviewsAreAvailable) {
      setIsBootstrapping(false)
      setError(undefined)
      setActiveBootstrapKey(undefined)
      return
    }
    let cancelled = false
    const abortController = new AbortController()

    const run = async () => {
      const startedAt = performance.now()
      const bootstrapKey = `${docVer.id}:${imageSize}:${pageNumber}:${pageSize}`
      setActiveBootstrapKey(bootstrapKey)
      setIsBootstrapping(true)
      setError(undefined)
      const retries = [0, 500, 1500]
      let ensured = false
      let lastError: string | undefined
      for (const delayMs of retries) {
        if (cancelled) {
          return
        }
        if (delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs))
        }
        const response = await ensureDocVerBuffer(docVer, {
          signal: abortController.signal
        })
        ensured = response.ok
        lastError = response.error
        if (ensured) {
          break
        }
      }
      if (cancelled) {
        return
      }
      if (!ensured || !fileManager.getByDocVerID(docVer.id)?.buffer) {
        setError(lastError ?? "Preview bootstrap failed. Please retry.")
        setIsBootstrapping(false)
        return
      }
      if (inflightBootstrapByDocVer.has(bootstrapKey)) {
        setIsBootstrapping(false)
        return
      }
      inflightBootstrapByDocVer.add(bootstrapKey)
      try {
        await dispatch(
          generatePreviews({
            docVer,
            size: imageSize,
            pageSize,
            pageNumber,
            pageTotal: docVer.pages.length
          })
        )
      } finally {
        inflightBootstrapByDocVer.delete(bootstrapKey)
      }
      console.info(
        `[preview-metric] bootstrap_complete docVer=${docVer.id} ms=${(performance.now() - startedAt).toFixed(2)}`
      )
      setIsBootstrapping(false)
      setActiveBootstrapKey(undefined)
    }

    void run()

    return () => {
      cancelled = true
      abortController.abort()
    }
  }, [
    dispatch,
    docVer,
    pageSize,
    pageNumber,
    allPreviewsAreAvailable,
    imageSize,
    retryTick
  ])

  const isCurrentBootstrapping =
    isBootstrapping &&
    Boolean(docVer) &&
    activeBootstrapKey === `${docVer?.id}:${imageSize}:${pageNumber}:${pageSize}`
  return {
    allPreviewsAreAvailable,
    isBootstrapping: isCurrentBootstrapping,
    error,
    retry
  }
}
