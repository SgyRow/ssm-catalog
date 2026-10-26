import {useAppDispatch, useAppSelector} from "@/app/hooks"
import {useCurrentDoc} from "@/features/document/hooks"
import {Alert, Button, Flex, Group, Loader} from "@mantine/core"
import {useDisclosure} from "@mantine/hooks"
import {useContext, useRef, useMemo} from "react"
import {useLocation, useNavigate} from "react-router-dom"

import Breadcrumbs from "@/components/Breadcrumbs"
import PanelContext from "@/contexts/PanelContext"

import EditNodeTitleModal from "@/components/EditNodeTitleModal"
import useEnsureDocVerBuffer from "@/features/document/hooks/useEnsureDocVerBuffer"
import useGeneratePreviews from "@/features/document/hooks/useGeneratePreviews"

import DocumentDetails from "@/components/document/DocumentDetails/DocumentDetails"
import classes from "@/components/document/Viewer.module.css"
import {applyPageChangesThunk} from "@/features/document/actions/applyPageOpChanges"
import ActionButtons from "@/features/document/components/ActionButtons"
import {useCurrentDocVer} from "@/features/document/hooks"
import {
  pagesDeleted,
  pagesReseted,
  pagesRotated,
  selectAllPages
} from "@/features/document/store/documentVersSlice"
import {
  currentDocVerUpdated,
  currentNodeChanged,
  selectContentHeight,
  selectLastPageSize
} from "@/features/ui/uiSlice"
import type {NType, PanelMode} from "@/types"
import {getViewerChromeKind, usesNativePdfPreview} from "@/features/document/documentPreview"
import DocxPageColumn from "@/features/document/components/DocxViewer/DocxPageColumn"
import {DocxScrollProvider} from "@/features/document/components/DocxViewer/DocxScrollContext"
import {DOC_VER_PAGINATION_PAGE_BATCH_SIZE} from "../constants"
import BlobDocumentViewer from "./BlobDocumentViewer/BlobDocumentViewer"
import NativePdfViewer from "./NativePdfViewer/NativePdfViewer"
import ContextMenu from "./ContextMenu"

import {useSelectedPages} from "@/features/document/hooks"
import useContextMenu from "@/features/document/hooks/useContextMenu"
import {viewerSelectionCleared} from "@/features/ui/uiSlice"
import DeleteEntireDocumentConfirm from "./DeleteEntireDocumentConfirm"
import PagesHaveChangedDialog from "./PageHaveChangedDialog"
import {isPortalDocumentNavState} from "@/features/portal/portalNavState"
import {drop_extension} from "@/utils"
import {useTranslation} from "react-i18next"

export default function Viewer() {
  const {t} = useTranslation()
  const {doc, isError, isLoading} = useCurrentDoc()
  const {docVer} = useCurrentDocVer()

  const ref = useRef<HTMLDivElement>(null)
  const mode: PanelMode = useContext(PanelContext)
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const height = useAppSelector(s => selectContentHeight(s, mode))
  const lastPageSize = useAppSelector(s => selectLastPageSize(s, mode))
  const chrome = docVer ? getViewerChromeKind(docVer.file_name) : undefined
  const customPreview = Boolean(docVer && !usesNativePdfPreview(docVer.file_name))
  /* Native PDF iframe also needs an authenticated buffer (no Bearer token on iframe GET). */
  useEnsureDocVerBuffer(docVer)
  const previewState = useGeneratePreviews({
    docVer: customPreview ? docVer : undefined,
    pageNumber: 1,
    pageSize: DOC_VER_PAGINATION_PAGE_BATCH_SIZE,
    imageSize: "md"
  })
  const selectedPages = useSelectedPages({mode, docVerID: docVer?.id})

  const breadcrumb = useMemo(() => {
    if (!doc?.breadcrumb?.length) {
      return doc?.breadcrumb
    }
    const items = doc.breadcrumb.map(([id, title]) => [id, title] as [string, string])
    const last = items[items.length - 1]
    items[items.length - 1] = [last[0], drop_extension(last[1])]
    return items
  }, [doc?.breadcrumb])

  const {
    opened,
    options: {close},
    position
  } = useContextMenu({ref})
  const [
    openedEditNodeTitleModal,
    {open: openEditNodeTitleModal, close: closeEditNodeTitleModal}
  ] = useDisclosure(false)
  const [
    openedDeleteEntireDocumentConfirm,
    {
      open: openDeleteEntireDocumentConfirm,
      close: closeDeleteEntireDocumentConfirm
    }
  ] = useDisclosure(false)

  const pages = useAppSelector(s => selectAllPages(s, docVer?.id)) || []

  const onClick = (node: NType) => {
    if (mode == "secondary" && node.ctype == "folder") {
      dispatch(
        currentNodeChanged({id: node.id, ctype: "folder", panel: "secondary"})
      )
    } else if (mode == "main" && node.ctype == "folder") {
      dispatch(currentDocVerUpdated({mode: mode, docVerID: undefined}))
      if (isPortalDocumentNavState(location.state)) {
        navigate(`/portal/folder/${node.id}`, {state: location.state})
      } else {
        navigate(`/folder/${node.id}?page_size=${lastPageSize}`)
      }
    }
  }

  const onEditNodeTitleItem = () => {
    openEditNodeTitleModal()
  }

  const onRotateCWItemClicked = () => {
    dispatch(
      pagesRotated({
        sources: selectedPages,
        angle: 90,
        targetDocVerID: docVer?.id!
      })
    )
  }

  const onResetChangesItemClicked = () => {
    if (docVer?.id) {
      dispatch(pagesReseted(docVer?.id))
    } else {
      console.warn("onResetChangesItemClicked: docVer.id is undefined")
    }
  }

  const onSaveChangesItemClicked = () => {
    if (doc?.id) {
      dispatch(applyPageChangesThunk({docID: doc.id, pages, mode}))
    } else {
      console.warn("onSaveChangesItemClicked: doc.id is undefined")
    }
  }

  const onRotateCCItemClicked = () => {
    dispatch(
      pagesRotated({
        sources: selectedPages,
        angle: -90,
        targetDocVerID: docVer?.id!
      })
    )
  }

  const onDeleteEntireDocumentConfirmCancel = () => {
    closeDeleteEntireDocumentConfirm()
  }

  const onDeleteEntireDocumentConfirmSubmit = () => {
    closeDeleteEntireDocumentConfirm()
    if (isPortalDocumentNavState(location.state)) {
      const pid = doc?.parent_id ?? location.state.portalRootId
      navigate(`/portal/folder/${pid}`, {state: location.state})
    } else {
      navigate("/library/favorites")
    }
  }

  const onDeletePagesItemClicked = () => {
    if (selectedPages.length == pages.length) {
      /* Confirm that user intends to delete entire document */
      openDeleteEntireDocumentConfirm()
    } else {
      dispatch(
        pagesDeleted({
          sources: selectedPages,
          targetDocVerID: docVer?.id!
        })
      )
      dispatch(viewerSelectionCleared(mode))
    }
  }

  const onDeleteDocumentItemClicked = () => {
    openDeleteEntireDocumentConfirm()
  }

  if (isLoading) {
    return <Loader />
  }

  if (isError || !doc) {
    return (
      <Alert color="red" title={t("pages.error.not_found.title")} m="md">
        {t("pages.error.not_found.message")}
      </Alert>
    )
  }

  if (!docVer) {
    return <Loader />
  }

  /**
   * Preview chrome switches on `docVer.file_name` (see `getViewerChromeKind`).
   *
   * - native-pdf: browser iframe preview (`NativePdfViewer`) for PDF and images.
   * - docx: `DocxScrollProvider` → `DocxPageColumn`.
   * - blob: `BlobDocumentViewer` → `BlobMediaPage` (video/audio/text/…).
   */
  if (!chrome) {
    return <Loader />
  }

  return (
    <div ref={ref}>
      <ActionButtons
        onEditNodeTitleClicked={onEditNodeTitleItem}
        onRotateCWClicked={onRotateCWItemClicked}
        onRotateCCClicked={onRotateCCItemClicked}
        onDeletePagesClicked={onDeletePagesItemClicked}
      />
      <Breadcrumbs breadcrumb={breadcrumb} onClick={onClick} leaf="document" />
      <Flex className={classes.inner} style={{height: `${height}px`}}>
        {chrome === "native-pdf" && <NativePdfViewer />}
        {chrome === "docx" && (
          <DocxScrollProvider>
            <DocxPageColumn />
          </DocxScrollProvider>
        )}
        {chrome === "blob" && <BlobDocumentViewer />}
        <DocumentDetails doc={doc} docID={doc?.id} isLoading={false} />
        {customPreview && <PagesHaveChangedDialog docID={doc.id} />}
        {customPreview && (
          <ContextMenu
            opened={opened}
            position={position}
            onEditNodeTitleItemClicked={onEditNodeTitleItem}
            onRotateCCItemClicked={onRotateCCItemClicked}
            onRotateCWItemClicked={onRotateCWItemClicked}
            onResetChangesItemClicked={onResetChangesItemClicked}
            onSaveChangesItemClicked={onSaveChangesItemClicked}
            onDeletePagesItemClicked={onDeletePagesItemClicked}
            onDeleteDocumentItemClicked={onDeleteDocumentItemClicked}
          />
        )}
      </Flex>
      {customPreview && previewState.error && (
        <Alert
          color="red"
          title={t("viewer.preview_load_failed")}
          mt="sm"
          variant="light"
        >
          {previewState.error}
          <Group mt="xs">
            <Button size="xs" variant="light" onClick={previewState.retry}>
              {t("viewer.retry_preview")}
            </Button>
          </Group>
        </Alert>
      )}
      {customPreview &&
        previewState.isBootstrapping &&
        !previewState.allPreviewsAreAvailable && (
          <Group mt="xs">
            <Loader size="sm" />
          </Group>
        )}
      <EditNodeTitleModal
        opened={openedEditNodeTitleModal}
        node={{id: doc?.id!, title: doc?.title!, ctype: "document"}}
        onSubmit={closeEditNodeTitleModal}
        onCancel={closeEditNodeTitleModal}
      />
      <DeleteEntireDocumentConfirm
        opened={openedDeleteEntireDocumentConfirm}
        onCancel={onDeleteEntireDocumentConfirmCancel}
        onSubmit={onDeleteEntireDocumentConfirmSubmit}
      />
    </div>
  )
}
