import {useAppDispatch, useAppSelector} from "@/app/hooks"

import {ensurePreviewForPage} from "@/features/document/actions"
import {
  APP_THUMBNAIL_KEY,
  APP_THUMBNAIL_VALUE,
  VIEWER_FILE_EDITING_ENABLED
} from "@/features/document/constants"
import {getBlobViewerCategory} from "@/features/document/documentPreview"
import {
  useCurrentDoc,
  useCurrentDocVer,
  useSelectedPages
} from "@/features/document/hooks"
import {
  pagesDroppedInDoc,
  selectCurrentPages,
  selectDocVerClientPage
} from "@/features/document/store/documentVersSlice"
import {
  dragEnded,
  dragPagesStarted,
  selectDraggedPages,
  selectDraggedPagesDocID,
  selectDraggedPagesDocParentID,
  viewerCurrentPageUpdated
} from "@/features/ui/uiSlice"
import {usePanelMode} from "@/hooks"
import type {UUID} from "@/types.d/common"
import {useDisclosure} from "@mantine/hooks"
import {Thumbnail} from "viewer"

import {
  viewerSelectionPageAdded,
  viewerSelectionPageRemoved
} from "@/features/ui/uiSlice"
import type {DroppedThumbnailPosition} from "@/types"

import TransferPagesModal from "@/features/document/components/TransferPagesModal"
import {contains_every} from "@/utils"
import {memo} from "react"
import MediaThumbnail from "./MediaThumbnail"
import useThumbnail from "./useThumbnail"

interface Args {
  pageNumber: number
  angle: number
  pageID: UUID
}

function ThumbnailContainer({pageNumber, angle, pageID}: Args) {
  const dispatch = useAppDispatch()
  const mode = usePanelMode()

  const [
    trPagesDialogOpened,
    {open: trPagesDialogOpen, close: trPagesDialogClose}
  ] = useDisclosure(false)

  const {doc} = useCurrentDoc()
  const {docVer} = useCurrentDocVer()
  const blobThumbnail = getBlobViewerCategory(docVer?.file_name) !== "pdf-pages"

  const {
    ref,
    imageURL,
    isLoading,
    checked,
    isDragged,
    withBorderBottom,
    withBorderTop,
    draggedPagesIDs,
    onDragOver,
    onDragLeave,
    clearBorderBottom,
    clearBorderTop
  } = useThumbnail(pageID, blobThumbnail)

  const draggedPages = useAppSelector(selectDraggedPages)
  const draggedPagesDocID = useAppSelector(selectDraggedPagesDocID)
  const draggedPagesDocParentID = useAppSelector(selectDraggedPagesDocParentID)
  const docVerPages = useAppSelector(s => selectCurrentPages(s, docVer?.id))
  const selectedPages = useSelectedPages({mode, docVerID: docVer?.id})
  const page = useAppSelector(s =>
    selectDocVerClientPage(s, {docVerID: docVer?.id, pageID})
  )

  const onClick = () => {
    dispatch(
      ensurePreviewForPage({
        docVer,
        targetPageNumber: pageNumber,
        size: "md"
      })
    )
    dispatch(
      viewerCurrentPageUpdated({
        pageNumber: pageNumber,
        panel: mode
      })
    )
  }

  const onLocalDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!VIEWER_FILE_EDITING_ENABLED) {
      return
    }
    event.preventDefault()
  }

  const onDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!VIEWER_FILE_EDITING_ENABLED) {
      return
    }
    let pages

    if (page) {
      pages = [page, ...selectedPages]
    } else {
      pages = selectedPages
    }
    const data = {
      pages: pages,
      docID: doc!.id,
      docParentID: doc!.parent_id!
    }
    e.dataTransfer.setData(APP_THUMBNAIL_KEY, APP_THUMBNAIL_VALUE)
    dispatch(dragPagesStarted(data))
  }

  const onDragEnd = () => {
    //dispatch(dragEnded())
  }

  const onLocalDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!VIEWER_FILE_EDITING_ENABLED) {
      return
    }
    let position: DroppedThumbnailPosition = "before"
    const y = event.clientY

    if (!draggedPagesIDs) {
      console.warn("Dragged pages array is empty")
      return
    }

    event.preventDefault()

    if (ref?.current) {
      const rect = ref?.current.getBoundingClientRect()
      const half = (rect.bottom - rect.top) / 2

      if (y >= rect.top && y < rect.top + half) {
        // dropped over upper half of the page
        position = "before"
      } else if (y >= rect.top + half && y < rect.bottom) {
        // dropped over lower half of the page
        position = "after"
      }

      const page_ids = docVerPages.map(p => p.id)
      const source_ids = draggedPagesIDs
      if (contains_every({container: page_ids, items: source_ids})) {
        /* Here we deal with page transfer which is within the same document
        i.e we are just reordering. It is so because all source pages (their IDs)
        were found in the target document version.
        */
        if (draggedPages && page && docVer) {
          dispatch(
            pagesDroppedInDoc({
              sources: draggedPages,
              target: page,
              targetDocVerID: docVer.id,
              position: position
            })
          )
        }

        dispatch(dragEnded())
      } else {
        // here we deal with pages transfer between documents
        trPagesDialogOpen()
      }
    } // if (ref?.current)
    clearBorderBottom()
    clearBorderTop()
  }

  const onCheck = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.currentTarget.checked) {
      dispatch(viewerSelectionPageAdded({itemID: pageID, mode}))
    } else {
      dispatch(viewerSelectionPageRemoved({itemID: pageID, mode}))
    }
  }

  const thumbCategory = getBlobViewerCategory(docVer?.file_name)
  const showCheckboxes = VIEWER_FILE_EDITING_ENABLED

  return (
    <>
      {blobThumbnail ? (
        <MediaThumbnail
          ref={ref as React.RefObject<HTMLDivElement>}
          category={thumbCategory}
          showCheckbox={showCheckboxes}
          onChange={showCheckboxes ? onCheck : undefined}
          checked={showCheckboxes ? checked : undefined}
          pageNumber={pageNumber}
          withBorderBottom={withBorderBottom}
          withBorderTop={withBorderTop}
          isDragged={isDragged}
          onDragStart={VIEWER_FILE_EDITING_ENABLED ? onDragStart : undefined}
          onDragEnd={VIEWER_FILE_EDITING_ENABLED ? onDragEnd : undefined}
          onDragOver={VIEWER_FILE_EDITING_ENABLED ? onDragOver : undefined}
          onDragLeave={VIEWER_FILE_EDITING_ENABLED ? onDragLeave : undefined}
          onDragEnter={
            VIEWER_FILE_EDITING_ENABLED ? onLocalDragEnter : undefined
          }
          onDrop={VIEWER_FILE_EDITING_ENABLED ? onLocalDrop : undefined}
          onClick={onClick}
        />
      ) : (
        <Thumbnail
          ref={ref as React.RefObject<HTMLImageElement>}
          showCheckbox={showCheckboxes}
          onChange={showCheckboxes ? onCheck : undefined}
          checked={showCheckboxes ? checked : undefined}
          pageNumber={pageNumber}
          angle={angle}
          imageURL={imageURL}
          isLoading={isLoading}
          withBorderBottom={withBorderBottom}
          withBorderTop={withBorderTop}
          isDragged={isDragged}
          onDragStart={VIEWER_FILE_EDITING_ENABLED ? onDragStart : undefined}
          onDragEnd={VIEWER_FILE_EDITING_ENABLED ? onDragEnd : undefined}
          onDragOver={VIEWER_FILE_EDITING_ENABLED ? onDragOver : undefined}
          onDragLeave={VIEWER_FILE_EDITING_ENABLED ? onDragLeave : undefined}
          onDragEnter={
            VIEWER_FILE_EDITING_ENABLED ? onLocalDragEnter : undefined
          }
          onDrop={VIEWER_FILE_EDITING_ENABLED ? onLocalDrop : undefined}
          onClick={onClick}
        />
      )}

      {VIEWER_FILE_EDITING_ENABLED &&
        draggedPagesDocParentID &&
        draggedPagesDocID &&
        draggedPagesIDs &&
        doc && (
          <TransferPagesModal
            targetDoc={doc}
            sourceDocID={draggedPagesDocID}
            sourceDocParentID={draggedPagesDocParentID}
            sourcePageIDs={draggedPagesIDs}
            targetPageID={pageID}
            opened={trPagesDialogOpened}
            onCancel={trPagesDialogClose}
            onSubmit={trPagesDialogClose}
          />
        )}
    </>
  )
}

/**
 * Thumbnails are rendered in long virtualized lists where parent re-renders
 * (scroll, selection, drag state) are frequent. Props are primitive, so
 * `memo` avoids re-running each thumbnail's work unless its own inputs
 * actually changed.
 */
export default memo(ThumbnailContainer)
