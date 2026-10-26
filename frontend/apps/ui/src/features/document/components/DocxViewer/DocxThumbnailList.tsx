import {useAppDispatch} from "@/app/hooks"
import useCurrentDocVer from "@/features/document/hooks/useCurrentDocVer"
import {viewerCurrentPageUpdated} from "@/features/ui/uiSlice"
import {usePanelMode} from "@/hooks"
import {Box, Loader, Text} from "@mantine/core"
import html2canvas from "html2canvas"
import {forwardRef, useEffect, useRef, useState} from "react"
import {ThumbnailList} from "viewer"

import {useDocxViewerScroll} from "./DocxScrollContext"

import classes from "./DocxThumbnailList.module.css"

const THUMB_MAX_PX = 130

async function sectionToObjectURL(el: HTMLElement): Promise<string | null> {
  const w = Math.max(1, el.scrollWidth || el.offsetWidth)
  const scale = Math.min(1, THUMB_MAX_PX / w)
  const view = el.ownerDocument.defaultView ?? window
  const canvas = await html2canvas(el, {
    scale,
    useCORS: true,
    logging: false,
    window: view
  })
  if (!canvas.width || !canvas.height) {
    return null
  }
  return new Promise(resolve => {
    canvas.toBlob(
      blob => {
        resolve(blob ? URL.createObjectURL(blob) : null)
      },
      "image/jpeg",
      0.82
    )
  })
}

const DocxThumbnailList = forwardRef<HTMLDivElement>((_props, ref) => {
  const dispatch = useAppDispatch()
  const mode = usePanelMode()
  const {docVer} = useCurrentDocVer()
  const {sectionsRef, pageCount, currentPageNumber} = useDocxViewerScroll()
  const [previews, setPreviews] = useState<(string | null)[]>([])
  const [captureFinished, setCaptureFinished] = useState(false)
  const blobUrlsRef = useRef<string[]>([])

  const revokeBlobs = () => {
    blobUrlsRef.current.forEach(u => URL.revokeObjectURL(u))
    blobUrlsRef.current = []
  }

  useEffect(() => {
    revokeBlobs()
    setPreviews([])
    setCaptureFinished(false)

    if (pageCount === 0 || !docVer?.id) {
      return
    }

    let cancelled = false

    const run = async () => {
      await new Promise(r => {
        window.requestAnimationFrame(() => r(undefined))
      })
      await new Promise(r => setTimeout(r, 120))

      const sections = [...sectionsRef.current].filter(Boolean)
      if (cancelled) {
        return
      }
      if (sections.length === 0) {
        setCaptureFinished(true)
        return
      }

      setPreviews(Array.from({length: sections.length}, () => null))

      for (let i = 0; i < sections.length; i++) {
        if (cancelled) {
          break
        }
        const el = sections[i]
        try {
          const url = await sectionToObjectURL(el)
          if (cancelled) {
            if (url) {
              URL.revokeObjectURL(url)
            }
            break
          }
          if (!url) {
            continue
          }
          blobUrlsRef.current.push(url)
          setPreviews(prev => {
            const next = [...prev]
            if (i < next.length) {
              next[i] = url
            }
            return next
          })
        } catch {
          /* keep null; fallback shows page number */
        }
      }

      if (!cancelled) {
        setCaptureFinished(true)
      }
    }

    void run()

    return () => {
      cancelled = true
      revokeBlobs()
    }
  }, [pageCount, docVer?.id])

  const onPageClick = (index: number) => {
    const n = index + 1
    dispatch(viewerCurrentPageUpdated({pageNumber: n, panel: mode}))
    const el = sectionsRef.current[index]
    el?.scrollIntoView({behavior: "smooth", block: "start"})
  }

  const provisional = pageCount === 0
  const count = provisional ? 1 : Math.max(1, pageCount)
  const items = Array.from({length: count}, (_, i) => {
    const n = i + 1
    const isActive = !provisional && n === currentPageNumber
    const preview = !provisional ? previews[i] : null
    return (
      <Box
        key={provisional ? "loading" : n}
        className={`${classes.thumb} thumbnail`}
        data-active={isActive || undefined}
        onClick={() => {
          if (!provisional) {
            onPageClick(i)
          }
        }}
      >
        {provisional ? (
          <Loader color="gray" size="sm" type="dots" />
        ) : preview ? (
          <>
            <img
              className={classes.previewImg}
              src={preview}
              alt=""
              draggable={false}
            />
            <Text size="xs" fw={600} className={classes.pageLabel}>
              {n}
            </Text>
          </>
        ) : captureFinished ? (
          <Text size="xs" fw={600}>
            {n}
          </Text>
        ) : (
          <Loader color="gray" size="sm" type="dots" />
        )}
      </Box>
    )
  })

  return (
    <ThumbnailList
      ref={ref}
      thumbnailItems={items}
      paginationInProgress={false}
      paginationFirstPageIsReady
    />
  )
})

DocxThumbnailList.displayName = "DocxThumbnailList"

export default DocxThumbnailList
