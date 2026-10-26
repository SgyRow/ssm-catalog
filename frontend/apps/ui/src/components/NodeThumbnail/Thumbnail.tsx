import {useAppSelector} from "@/app/hooks"
import {
  getBlobViewerCategory,
  type BlobViewerCategory
} from "@/features/document/documentPreview"
import {selectThumbnailByNodeId} from "@/features/nodes/selectors"
import {getBaseURL, getDefaultHeaders} from "@/utils"
import {useEffect, useRef, useState} from "react"

import FileTypeThumbnailFallback from "./FileTypeThumbnailFallback"

interface Args {
  nodeID: string
  fileName: string
  serverThumbnailUrl: string | null
}

function resolveThumbnailRequestUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl
  }
  return `${getBaseURL(true)}${pathOrUrl}`
}

function thumbnailRequestHeaders(): Record<string, string> {
  const h = {...getDefaultHeaders()}
  delete h["Content-Type"]
  return h
}

export default function Thumbnail({
  nodeID,
  fileName,
  serverThumbnailUrl
}: Args) {
  const redux = useAppSelector(s => selectThumbnailByNodeId(s, nodeID))
  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null)
  const revokeOnCleanupRef = useRef<string | null>(null)
  const category: BlobViewerCategory = getBlobViewerCategory(fileName)

  useEffect(() => {
    if (redux?.url) {
      if (revokeOnCleanupRef.current) {
        URL.revokeObjectURL(revokeOnCleanupRef.current)
        revokeOnCleanupRef.current = null
      }
      setLocalBlobUrl(null)
      return
    }

    if (!serverThumbnailUrl) {
      if (revokeOnCleanupRef.current) {
        URL.revokeObjectURL(revokeOnCleanupRef.current)
        revokeOnCleanupRef.current = null
      }
      setLocalBlobUrl(null)
      return
    }

    let cancelled = false
    const url = resolveThumbnailRequestUrl(serverThumbnailUrl)

    if (revokeOnCleanupRef.current) {
      URL.revokeObjectURL(revokeOnCleanupRef.current)
      revokeOnCleanupRef.current = null
    }
    setLocalBlobUrl(null)
    ;(async () => {
      try {
        const res = await fetch(url, {
          headers: thumbnailRequestHeaders(),
          credentials: "include"
        })
        if (!res.ok || cancelled) {
          return
        }
        const blob = await res.blob()
        if (cancelled) {
          return
        }
        const objectUrl = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        revokeOnCleanupRef.current = objectUrl
        setLocalBlobUrl(objectUrl)
      } catch {
        /* fallback icon */
      }
    })()

    return () => {
      cancelled = true
      if (revokeOnCleanupRef.current) {
        URL.revokeObjectURL(revokeOnCleanupRef.current)
        revokeOnCleanupRef.current = null
      }
    }
  }, [redux?.url, serverThumbnailUrl, nodeID])

  if (redux?.url && !redux.error) {
    return <img src={redux.url} alt="" />
  }

  if (localBlobUrl) {
    return <img src={localBlobUrl} alt="" />
  }

  return <FileTypeThumbnailFallback category={category} />
}
