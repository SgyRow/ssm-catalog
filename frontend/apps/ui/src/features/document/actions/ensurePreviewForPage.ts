import {AppThunk} from "@/app/types"
import {
  DOC_VER_PAGINATION_PAGE_BATCH_SIZE,
  DOC_VER_PAGINATION_THUMBNAIL_BATCH_SIZE
} from "@/features/document/constants"
import {ImageSize} from "@/types.d/common"
import {ClientDocumentVersion} from "../types"
import {generateNextPreviews} from "./generateNextPreviews"

interface Args {
  docVer?: ClientDocumentVersion
  targetPageNumber: number
  size: ImageSize
}

export const ensurePreviewForPage =
  ({docVer, targetPageNumber, size}: Args): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    if (!docVer) {
      console.warn("[ensurePreviewForPage] skipped: missing docVer")
      return
    }

    const normalizedPageNumber = Math.max(1, Math.floor(targetPageNumber))
    const sortedPages = docVer.pages.slice().sort((a, b) => a.number - b.number)
    const targetIndex = sortedPages.findIndex(
      p => p.number === normalizedPageNumber
    )
    const targetPage = targetIndex >= 0 ? sortedPages[targetIndex] : undefined
    if (!targetPage) {
      console.warn(
        `[ensurePreviewForPage] skipped: target page ${normalizedPageNumber} not found`
      )
      return
    }

    const hasTargetPreview = () => {
      const state = getState()
      const page = state.imageObjects.pageIDEntities[targetPage.id]
      return Boolean(page?.docVerID === docVer.id && page[size])
    }

    if (hasTargetPreview()) {
      return
    }

    const pageSize =
      size === "sm"
        ? DOC_VER_PAGINATION_THUMBNAIL_BATCH_SIZE
        : DOC_VER_PAGINATION_PAGE_BATCH_SIZE
    const maxBatches = Math.ceil(docVer.pages.length / pageSize)
    // Use position in sorted page list, not page.number, because numbers may have gaps.
    const targetBatchPage = Math.ceil((targetIndex + 1) / pageSize)
    let attempts = 0
    let stalled = 0

    while (!hasTargetPreview() && attempts < maxBatches) {
      const state = getState()
      const currentPaginationPage =
        size === "sm"
          ? (state.docVers.entities[docVer.id]?.thumbnailsPagination?.page_number ??
            1)
          : state.docVers.entities[docVer.id]?.pagination?.page_number ?? 1
      const requestedPageNumber =
        currentPaginationPage >= targetBatchPage
          ? targetBatchPage
          : currentPaginationPage + 1
      const nextBatchStartIndex = (requestedPageNumber - 1) * pageSize

      if (nextBatchStartIndex >= docVer.pages.length) {
        console.warn(
          `[ensurePreviewForPage] stop: reached end of document docVer=${docVer.id}`
        )
        return
      }

      const result = await dispatch(
        generateNextPreviews({docVer, pageNumber: requestedPageNumber, size})
      )
      if (result?.dispatched && result?.progressed !== false) {
        attempts += 1
        stalled = 0
      } else {
        stalled += 1
        if (stalled > 10) {
          break
        }
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }
    if (!hasTargetPreview()) {
      console.warn(
        `[ensurePreviewForPage] failed after ${attempts} attempts docVer=${docVer.id} page=${normalizedPageNumber} size=${size}`
      )
    }
  }
