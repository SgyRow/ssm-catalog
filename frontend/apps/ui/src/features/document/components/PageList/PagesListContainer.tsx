import {useAppDispatch, useAppSelector} from "@/app/hooks"
import PanelContext from "@/contexts/PanelContext"
import {selectDocVerPaginationPageNumber} from "@/features/document/store/documentVersSlice"
import {selectIsGeneratingPreviews} from "@/features/document/store/imageObjectsSlice"

import Zoom from "@/components/document/Zoom"
import {getFileExtension} from "@/features/document/documentPreview"
import {generateNextPreviews} from "@/features/document/actions"
import {DOC_VER_PAGINATION_PAGE_BATCH_SIZE} from "@/features/document/constants"
import useAreAllPreviewsAvailable from "@/features/document/hooks/useAreAllPreviewsAvailable"
import useCurrentDocVer from "@/features/document/hooks/useCurrentDocVer"
import {selectZoomFactor} from "@/features/ui/uiSlice"
import type {PanelMode} from "@/types"
import {useContext, useEffect, useRef} from "react"
import {PageList} from "viewer"
import Page from "../Page"
import usePageList from "./usePageList"

export default function PageListContainer() {
  const {docVer} = useCurrentDocVer()
  const dispatch = useAppDispatch()
  const mode: PanelMode = useContext(PanelContext)
  const zoomFactor = useAppSelector(s => selectZoomFactor(s, mode))
  const pageNumber = useAppSelector(s =>
    selectDocVerPaginationPageNumber(s, docVer?.id)
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const isGenerating = useAppSelector(s =>
    selectIsGeneratingPreviews(s, "md", docVer?.id)
  )
  const {pages, loadMore, currentPageNumber} = usePageList({
    docVerID: docVer?.id,
    totalCount: docVer?.pages.length,
    cssSelector: ".page",
    containerRef: containerRef
  })
  const nextPageNumber = pageNumber + 1
  const hasMorePages = (docVer?.pages.length ?? 0) > pages.length
  const isPdfDocument = getFileExtension(docVer?.file_name) === ".pdf"
  const effectiveZoomFactor = isPdfDocument ? zoomFactor : 100
  const allPreviewsAreAvailable = useAreAllPreviewsAvailable({
    docVer,
    pageSize: DOC_VER_PAGINATION_PAGE_BATCH_SIZE,
    pageNumber: nextPageNumber,
    imageSize: "md"
  })

  const pageComponents = pages.map(p => (
    <Page
      key={p.id}
      pageID={p.id}
      zoomFactor={effectiveZoomFactor}
      angle={p.angle}
      pageNumber={p.number}
    />
  ))

  useEffect(() => {
    if (!hasMorePages || isGenerating) {
      return
    }
    // Use real loaded pages count as the source of truth. This avoids stalls when
    // pagination state and rendered pages diverge (e.g. after skipped/empty batches).
    const nextMissingBatchPageNumber =
      Math.floor(pages.length / DOC_VER_PAGINATION_PAGE_BATCH_SIZE) + 1
    const shouldLoadMore =
      loadMore ||
      (pages.length > 0 && currentPageNumber >= Math.max(1, pages.length - 1))
    if (!shouldLoadMore) {
      return
    }
    dispatch(
      generateNextPreviews({
        docVer,
        pageNumber: nextMissingBatchPageNumber
      })
    )
  }, [
    currentPageNumber,
    dispatch,
    docVer,
    hasMorePages,
    isGenerating,
    loadMore,
    pages.length
  ])

  return (
    <PageList
      ref={containerRef}
      pageItems={pageComponents}
      paginationInProgress={isGenerating}
      zoom={
        isPdfDocument ? (
        <Zoom
          pageNumber={currentPageNumber}
          pageTotal={docVer?.pages.length || 1}
        />
        ) : undefined
      }
    />
  )
}
