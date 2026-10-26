import {AppDispatch, RootState} from "@/app/types"
import {
  DOC_VER_PAGINATION_PAGE_BATCH_SIZE,
  DOC_VER_PAGINATION_THUMBNAIL_BATCH_SIZE
} from "@/features/document/constants"
import {
  docVerPaginationUpdated,
  docVerThumbnailsPaginationUpdated
} from "@/features/document/store/documentVersSlice"
import {
  generatePreviews,
  markGeneratingPreviewsBegin,
  markGeneratingPreviewsEnd,
  selectIsGeneratingPreviews
} from "@/features/document/store/imageObjectsSlice"

import {ClientDocumentVersion} from "@/types"
import {ImageSize} from "@/types.d/common"

interface Args {
  docVer?: ClientDocumentVersion
  pageNumber: number
  size?: ImageSize
  thumbnailListPageCount?: number
}

export const generateNextPreviews =
  ({docVer, pageNumber, size = "md", thumbnailListPageCount}: Args) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    if (!docVer) {
      return {dispatched: false}
    }
    const stateBefore = getState()
    if (selectIsGeneratingPreviews(stateBefore, size, docVer.id)) {
      return {dispatched: false}
    }
    // Let main page previews (md) preempt thumbnails, but do not block md on sm.
    if (
      size === "sm" &&
      (selectIsGeneratingPreviews(stateBefore, "md", docVer.id) ||
        selectIsGeneratingPreviews(stateBefore, "lg", docVer.id) ||
        selectIsGeneratingPreviews(stateBefore, "xl", docVer.id))
    ) {
      return {dispatched: false}
    }

    dispatch(markGeneratingPreviewsBegin({docVerID: docVer.id, size}))

    const pageSize =
      size == "sm"
        ? DOC_VER_PAGINATION_THUMBNAIL_BATCH_SIZE
        : DOC_VER_PAGINATION_PAGE_BATCH_SIZE
    const sortedPages = docVer.pages.slice().sort((a, b) => a.number - b.number)
    const firstIdx = (pageNumber - 1) * pageSize
    const lastExclusive = Math.min(firstIdx + pageSize, sortedPages.length)
    const batchPages = sortedPages.slice(firstIdx, lastExclusive)
    const batchIsAlreadyReady = batchPages.every(page => {
      const existing = stateBefore.imageObjects.pageIDEntities[page.id]
      return Boolean(existing?.docVerID === docVer.id && existing[size])
    })

    if (batchPages.length > 0 && batchIsAlreadyReady) {
      if (size == "sm") {
        dispatch(
          docVerThumbnailsPaginationUpdated({
            pageNumber: pageNumber,
            pageSize: pageSize,
            docVerID: docVer.id
          })
        )
      } else {
        dispatch(
          docVerPaginationUpdated({
            pageNumber: pageNumber,
            pageSize: pageSize,
            docVerID: docVer.id
          })
        )
      }
      return {dispatched: false, progressed: true}
    }

    const action = await dispatch(
      generatePreviews({
        docVer,
        size,
        pageSize: pageSize,
        pageNumber,
        thumbnailListPageCount,
        pageTotal: docVer.pages.length
      })
    )

    dispatch(markGeneratingPreviewsEnd({docVerID: docVer.id, size}))
    const generatedItems =
      generatePreviews.fulfilled.match(action) && action.payload?.items
        ? action.payload.items.length
        : 0
    if (generatedItems === 0) {
      return {dispatched: true, progressed: false}
    }

    if (size == "sm") {
      dispatch(
        docVerThumbnailsPaginationUpdated({
          pageNumber: pageNumber,
          pageSize: pageSize,
          docVerID: docVer.id
        })
      )
    } else {
      dispatch(
        docVerPaginationUpdated({
          pageNumber: pageNumber,
          pageSize: pageSize,
          docVerID: docVer.id
        })
      )
    }
    return {dispatched: true, progressed: true}
  }
