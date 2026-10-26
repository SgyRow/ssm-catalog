import {Box, Group, Stack, Text} from "@mantine/core"
import {useDisclosure} from "@mantine/hooks"
import {useContext, useEffect, useMemo, useRef, useState} from "react"
import {createRoot} from "react-dom/client"

import {useAppDispatch, useAppSelector} from "@/app/hooks"
import {useLocation, useNavigate, Navigate} from "react-router-dom"

import {
  currentNodeChanged,
  selectCurrentNodeID,
  selectDraggedPagesDocID,
  selectDraggedPagesDocParentID,
  selectFilterText
} from "@/features/ui/uiSlice"

import {
  isFetchBaseQueryError,
  isHTTP403Forbidden,
  isHTTP404NotFound,
  isHTTP422UnprocessableContent
} from "@/services/helpers"

import {
  ERRORS_403_ACCESS_FORBIDDEN,
  ERRORS_404_RESOURCE_NOT_FOUND,
  ERRORS_422_UNPROCESSABLE_CONTENT
} from "@/cconstants"
import {isSupportedFile, sortCommanderNodes} from "@/features/nodes/utils"
import {useGetPortalRootQuery} from "@/features/portal/portalApiSlice"
import PortalFolderTree from "@/features/portal/components/PortalFolderTree"
import {makePortalDocumentNavState} from "@/features/portal/portalNavState"
import {
  canCreateFolderInCommander,
  canDeleteInCommander,
  canMoveInCommander,
  canOpenCommander,
  canRenameInCommander,
  canUploadInCommander,
  PORTAL_VIEW
} from "@/scopes"

import Breadcrumbs from "@/components/Breadcrumbs"
import Pagination from "@/components/Pagination"
import PanelContext from "@/contexts/PanelContext"
import {
  useGetFolderQuery,
  useGetPaginatedNodesQuery,
  useReorderNodesMutation
} from "@/features/nodes/apiSlice"
import {
  commanderLastPageSizeUpdated,
  currentDocVerUpdated,
  selectContentHeight,
  selectCommanderSortMenuColumn,
  selectCommanderSortMenuDir,
  selectHomeFolderTreeSidebarHeight,
  selectDraggedNodes,
  selectDraggedNodesSourceFolderID,
  selectDraggedPages,
  selectHomeFolderTreeOpen,
  selectLastPageSize
} from "@/features/ui/uiSlice"
import type {
  NodeType,
  NType,
  PanelMode,
  SortMenuColumn,
  SortMenuDirection
} from "@/types"
import classes from "./Commander.module.scss"

import {
  APP_THUMBNAIL_KEY,
  APP_THUMBNAIL_VALUE
} from "@/features/document/constants"
import {APP_NODE_KEY, APP_NODE_VALUE} from "@/features/nodes/constants"
import {useTranslation} from "react-i18next"
import DraggingIcon from "./DraggingIcon"
import {DropFilesModal} from "./DropFiles"
import DropNodesModal from "./DropNodesDialog"
import ExtractPagesModal from "./ExtractPagesModal"
import {selectCurrentUser, selectCurrentUserStatus} from "@/slices/currentUser"
import {equalUUIDs} from "@/utils"

import FolderNodeActions from "./FolderNodeActions"
import NodesList from "./NodesList"
import SupportedFilesInfoModal from "./SupportedFilesInfoModal"

const REORDER_PAGE_SIZE = 1000

function moveNodeInList(
  items: NodeType[],
  fromId: string,
  toId: string
): NodeType[] {
  const from = items.findIndex(item => item.id === fromId)
  const to = items.findIndex(item => item.id === toId)
  if (from < 0 || to < 0 || from === to) {
    return items
  }
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export default function Commander() {
  const {t} = useTranslation()
  const [
    supportedFilesInfoOpened,
    {open: supportedFilesInfoOpen, close: supportedFilesInfoClose}
  ] = useDisclosure(false)
  // dialog for dropped files from local file system (i.e. from outside of browser)
  const [dropFilesOpened, {open: dropFilesOpen, close: dropFilesClose}] =
    useDisclosure(false)
  // dialog for extracting document pages (i.e. doc -> commander)
  const [
    extractPagesOpened,
    {open: extractPagesOpen, close: extractPagesClose}
  ] = useDisclosure(false)
  // confirmation dialog when dropping nodes in commander
  const [dropNodesOpened, {open: dropNodesOpen, close: dropNodesClose}] =
    useDisclosure(false)
  const [dragOver, setDragOver] = useState<boolean>(false)
  const mode: PanelMode = useContext(PanelContext)
  const height = useAppSelector(s => selectContentHeight(s, mode))
  // Commander group padding (0.25rem top + bottom).
  const folderTreeHeight = useAppSelector(
    s => selectHomeFolderTreeSidebarHeight(s) - 8
  )
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAppSelector(selectCurrentUser)
  const userStatus = useAppSelector(selectCurrentUserStatus)
  const onPortalFolderPath = location.pathname.startsWith("/folder/")
  const {data: portalRoot} = useGetPortalRootQuery(undefined, {
    skip:
      !onPortalFolderPath ||
      !(user?.scopes?.includes(PORTAL_VIEW) ?? false)
  })
  const lastPageSize = useAppSelector(s => selectLastPageSize(s, mode))
  const homeFolderTreeOpen = useAppSelector(selectHomeFolderTreeOpen)
  const currentNodeID = useAppSelector(s => selectCurrentNodeID(s, mode))
  const draggedPages = useAppSelector(selectDraggedPages)
  const draggedNodes = useAppSelector(selectDraggedNodes)
  const draggedNodesSourceFolderID = useAppSelector(
    selectDraggedNodesSourceFolderID
  )
  // needed to invalidate document tag
  const draggedPagesDocID = useAppSelector(selectDraggedPagesDocID)
  // needed to invalidate document's parent node tag
  const draggedPagesDocParentID = useAppSelector(selectDraggedPagesDocParentID)
  const [pageSize, setPageSize] = useState<number>(lastPageSize)
  const [page, setPage] = useState<number>(1)
  const filter = useAppSelector(s => selectFilterText(s, mode))
  const sortColumn = useAppSelector(s => selectCommanderSortMenuColumn(s, mode))
  const sortDir = useAppSelector(s => selectCommanderSortMenuDir(s, mode))
  const [reorderMode, setReorderMode] = useState(false)
  const [orderedItems, setOrderedItems] = useState<NodeType[]>([])
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const draggingNodeIdRef = useRef<string | null>(null)
  const reorderBaselineRef = useRef<NodeType[]>([])
  const [reorderSaving, setReorderSaving] = useState(false)
  const [reorderNodes] = useReorderNodesMutation()

  useEffect(() => {
    setReorderMode(false)
    setDraggingNodeId(null)
    draggingNodeIdRef.current = null
    reorderBaselineRef.current = []
    setPage(1)
  }, [currentNodeID])

  const {data, isLoading, isFetching, isError, refetch, error} =
    useGetPaginatedNodesQuery(
      {
        nodeID: currentNodeID!,
        page_number: reorderMode ? 1 : page,
        page_size: reorderMode ? REORDER_PAGE_SIZE : pageSize,
        filter: reorderMode ? undefined : filter,
        sortColumn: reorderMode ? undefined : sortColumn,
        sortDir: reorderMode ? undefined : sortDir
      },
      {skip: !currentNodeID}
    )
  const {data: currentFolder} = useGetFolderQuery(currentNodeID!, {
    skip: !currentNodeID
  })
  const [uploadFiles, setUploadFiles] = useState<File[] | FileList>()

  const isUnderPortalRoot = useMemo(() => {
    if (!portalRoot || !currentFolder?.breadcrumb?.length) {
      return false
    }
    const rootId = currentFolder.breadcrumb[0][0]
    return equalUUIDs(rootId, portalRoot.id)
  }, [portalRoot, currentFolder?.breadcrumb])

  const portalDocumentNavState = useMemo(
    () => (portalRoot ? makePortalDocumentNavState(portalRoot) : null),
    [portalRoot]
  )

  const commanderWriteContext = useMemo(
    () => ({isPortalContext: isUnderPortalRoot && onPortalFolderPath}),
    [isUnderPortalRoot, onPortalFolderPath]
  )

  const scopes = user?.scopes ?? []

  const commanderDragDropEnabled = useMemo(() => {
    if (reorderMode) {
      return false
    }
    if (!canOpenCommander(scopes)) {
      return false
    }
    return (
      canUploadInCommander(scopes, commanderWriteContext) ||
      canMoveInCommander(scopes, commanderWriteContext) ||
      canCreateFolderInCommander(scopes, commanderWriteContext) ||
      canDeleteInCommander(scopes, commanderWriteContext) ||
      canRenameInCommander(scopes, commanderWriteContext)
    )
  }, [scopes, commanderWriteContext, reorderMode])

  useEffect(() => {
    if (!reorderMode || !data?.items?.length) {
      return
    }
    if (reorderBaselineRef.current.length === 0) {
      reorderBaselineRef.current = data.items
      setOrderedItems(data.items)
    }
  }, [data?.items, reorderMode])

  useEffect(() => {
    if (!draggingNodeId) {
      return
    }
    const onMove = (event: PointerEvent) => {
      const dragId = draggingNodeIdRef.current
      if (!dragId) {
        return
      }
      event.preventDefault()
      const el = document.elementFromPoint(event.clientX, event.clientY)
      const target = el?.closest("[data-node-id]") as HTMLElement | null
      const targetId = target?.dataset.nodeId
      if (!targetId || targetId === dragId) {
        return
      }
      setOrderedItems(prev => moveNodeInList(prev, dragId, targetId))
    }
    const onUp = () => {
      draggingNodeIdRef.current = null
      setDraggingNodeId(null)
    }
    window.addEventListener("pointermove", onMove, {passive: false})
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [draggingNodeId])

  if (userStatus === "loading" || userStatus === "idle") {
    return <div>{t("common.loading")}</div>
  }

  if (userStatus === "succeeded" && user && !canOpenCommander(scopes)) {
    return <Navigate to={ERRORS_403_ACCESS_FORBIDDEN} replace />
  }

  if (!currentNodeID) {
    return <div>{t("common.loading")}</div>
  }

  const portalFolderTreeContext =
    mode === "main" && isUnderPortalRoot && onPortalFolderPath

  const showPortalFolderTree = portalFolderTreeContext && homeFolderTreeOpen

  if (isLoading && !data && !(reorderMode && orderedItems.length > 0)) {
    return <div>{t("common.loading")}</div>
  }

  if (isError && isHTTP422UnprocessableContent(error)) {
    navigate(ERRORS_422_UNPROCESSABLE_CONTENT)
  }

  if (isError && isHTTP404NotFound(error)) {
    navigate(ERRORS_404_RESOURCE_NOT_FOUND)
  }

  if (isError && isHTTP403Forbidden(error)) {
    navigate(ERRORS_403_ACCESS_FORBIDDEN)
  }

  if (isError) {
    const detail = isFetchBaseQueryError(error)
      ? t("nodes.load_folder_error", {status: String(error.status)})
      : t("nodes.load_folder_error_generic", {message: String(error)})
    return <div>{detail}</div>
  }

  if (!data && !(reorderMode && orderedItems.length > 0)) {
    return <div>{t("nodes.error.data_null")}</div>
  }

  const onClick = (node: NType) => {
    if (mode == "secondary") {
      return dispatch(
        currentNodeChanged({id: node.id, ctype: node.ctype, panel: "secondary"})
      )
    }
    // mode == "main"
    switch (node.ctype) {
      case "folder":
        dispatch(currentDocVerUpdated({mode: mode, docVerID: undefined}))
        navigate(`/folder/${node.id}?page_size=${lastPageSize}`)
        break
      case "document":
        navigate(`/document/${node.id}`)
        break
    }
  }

  const onPageNumberChange = (page: number) => {
    setPage(page)
  }

  const onPageSizeChange = (value: string | null) => {
    if (value) {
      const pSize = parseInt(value)
      setPageSize(pSize)
      // reset current page
      setPage(1)
      // remember last page size
      dispatch(commanderLastPageSizeUpdated({pageSize: pSize, mode}))
    }
  }
  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (commanderDragDropEnabled) {
      setDragOver(true)
    }
  }

  const onDragEnter = () => {
    if (commanderDragDropEnabled) {
      setDragOver(true)
    }
  }

  const onDragLeave = () => {
    setDragOver(false)
  }

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const payloadThumbnailData = event.dataTransfer.getData(APP_THUMBNAIL_KEY)
    const payloadNodeData = event.dataTransfer.getData(APP_NODE_KEY)

    setDragOver(false)

    if (!commanderDragDropEnabled) {
      return
    }

    if (event.dataTransfer.files.length > 0) {
      /** (1)
       * Why dataTransfer.files.length > 0 When Dragging <img> From the App?
         When you drag an <img src="..."> element (even inside your own app),
         the browser (especially Chrome and Firefox) automatically attaches the image file to
         the DataTransfer object. This happens even if:
          * The <img> was never selected by the user from the file system.
          * The image is loaded from a remote URL or a data URL.
       */
      if (payloadThumbnailData == APP_THUMBNAIL_VALUE) {
        // ignore, as this is dragging thumbnails from docviewer
        // see (1)
      } else if (payloadNodeData == APP_NODE_VALUE) {
        // ignore, as this is dragging commander's node
        // see (1)
      } else {
        // files dropped from local FS
        const files = Array.from(event.dataTransfer.files)
        const validFiles = files.filter(isSupportedFile)

        if (validFiles.length === 0) {
          supportedFilesInfoOpen()
          return
        }

        setUploadFiles(validFiles)
        dropFilesOpen()
        return
      }
    }
    if (draggedPages && draggedPages?.length > 0) {
      extractPagesOpen()

      return
    }
    if (draggedNodes && draggedNodes?.length > 0) {
      dropNodesOpen()
      return
    }
  }

  const onDropFilesModalClose = () => {
    dropFilesClose()
    setUploadFiles(undefined)
  }

  const onPagesExtracted = () => {
    extractPagesClose()
    // Fetch again (bypassing cache) nodes of current folder.
    // Current folder has now newly extracted docs.
    refetch()
  }

  const onNodeDrag = () => {}

  const onNodeDragStart = (nodeID: string, event: React.DragEvent) => {
    if (reorderMode) {
      event.preventDefault()
      return
    }
    const image = <DraggingIcon nodeID={nodeID} />
    let ghost = document.createElement("div")
    ghost.style.transform = "translate(-10000px, -10000px)"
    ghost.style.position = "absolute"
    document.body.appendChild(ghost)
    event.dataTransfer.setDragImage(ghost, 0, -10)
    event.dataTransfer.setData(APP_NODE_KEY, APP_NODE_VALUE)

    let root = createRoot(ghost)
    root.render(image)
  }

  const onStartReorder = () => {
    const items = data?.items ?? []
    reorderBaselineRef.current = items
    setOrderedItems(items)
    setReorderMode(true)
  }

  const onCancelReorder = () => {
    draggingNodeIdRef.current = null
    setDraggingNodeId(null)
    reorderBaselineRef.current = []
    setOrderedItems(data?.items ?? [])
    setReorderMode(false)
  }

  const onApplyReorderSort = (
    column: SortMenuColumn | undefined,
    direction: SortMenuDirection
  ) => {
    if (!column) {
      setOrderedItems([...reorderBaselineRef.current])
      return
    }
    setOrderedItems(prev => sortCommanderNodes(prev, column, direction))
  }

  const onFinishReorder = async () => {
    if (!currentNodeID) {
      return
    }
    setReorderSaving(true)
    try {
      await reorderNodes({
        parentId: currentNodeID,
        node_ids: orderedItems.map(item => item.id)
      }).unwrap()
      reorderBaselineRef.current = []
      setReorderMode(false)
    } finally {
      draggingNodeIdRef.current = null
      setDraggingNodeId(null)
      setReorderSaving(false)
    }
  }

  const onReorderPointerDown = (
    event: React.PointerEvent,
    nodeID: string
  ) => {
    if (!reorderMode) {
      return
    }
    event.preventDefault()
    draggingNodeIdRef.current = nodeID
    setDraggingNodeId(nodeID)
  }

  const visibleItems = reorderMode ? orderedItems : (data?.items ?? [])

  let commanderContent

  if (visibleItems.length > 0) {
    commanderContent = (
      <>
        <Stack gap="xs">
          {reorderMode && (
            <Text size="sm" c="dimmed">
              {t("nodes.reorder.hint")}
            </Text>
          )}
          <Group>
            <NodesList
              items={visibleItems}
              onClick={onClick}
              onNodeDrag={onNodeDrag}
              onNodeDragStart={onNodeDragStart}
              reorderMode={reorderMode}
              draggingNodeId={draggingNodeId}
              onReorderPointerDown={onReorderPointerDown}
            />
          </Group>
        </Stack>
        {!reorderMode && data && (
          <Pagination
            pagination={{
              pageNumber: page,
              pageSize: pageSize!,
              numPages: data.num_pages
            }}
            onPageNumberChange={onPageNumberChange}
            onPageSizeChange={onPageSizeChange}
            lastPageSize={lastPageSize}
          />
        )}
      </>
    )
  } else {
    commanderContent = <Group>{t("common.empty")}</Group>
  }

  return (
    <>
      <Group
        align="flex-start"
        wrap="nowrap"
        gap="md"
        className={dragOver ? classes.accept_files : classes.commander}
      >
        {showPortalFolderTree &&
          portalRoot &&
          portalDocumentNavState && (
          <PortalFolderTree
            portalRootId={portalRoot.id}
            portalRootTitle={t("portal.root_folder")}
            currentFolderId={currentNodeID}
            height={folderTreeHeight}
            documentNavState={portalDocumentNavState}
            folderNav="commander"
            commanderPageSize={lastPageSize}
          />
        )}
        <Box
          style={{flex: 1, minWidth: 0}}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <FolderNodeActions
            homeFolderTreeAvailable={portalFolderTreeContext}
            portalCatalogFolderId={
              portalFolderTreeContext ? currentNodeID : undefined
            }
            commanderWriteContext={commanderWriteContext}
            reorderMode={reorderMode}
            reorderSaving={reorderSaving}
            onStartReorder={onStartReorder}
            onFinishReorder={onFinishReorder}
            onCancelReorder={onCancelReorder}
            onApplyReorderSort={onApplyReorderSort}
          />
          <Breadcrumbs
            breadcrumb={currentFolder?.breadcrumb}
            onClick={onClick}
            isFetching={isFetching}
          />
          <Stack
            className={classes.content}
            justify={"space-between"}
            style={{height: `${height}px`}}
          >
            {commanderContent}
          </Stack>
        </Box>
      </Group>
      {currentFolder && uploadFiles && uploadFiles.length > 0 && (
        <DropFilesModal
          opened={dropFilesOpened}
          source_files={uploadFiles}
          target={currentFolder}
          onSubmit={onDropFilesModalClose}
          onCancel={onDropFilesModalClose}
        />
      )}
      {draggedPagesDocParentID &&
        draggedPagesDocID &&
        currentFolder &&
        draggedPages &&
        draggedPages.length > 0 && (
          <ExtractPagesModal
            sourcePages={draggedPages}
            sourceDocID={draggedPagesDocID}
            sourceDocParentID={draggedPagesDocParentID}
            targetFolder={currentFolder}
            opened={extractPagesOpened}
            onSubmit={onPagesExtracted}
            onCancel={extractPagesClose}
          />
        )}
      {draggedNodes &&
        currentFolder &&
        draggedNodes.length > 0 &&
        draggedNodesSourceFolderID && (
          <DropNodesModal
            sourceNodes={draggedNodes}
            targetFolder={currentFolder}
            sourceFolderID={draggedNodesSourceFolderID}
            opened={dropNodesOpened}
            onSubmit={dropNodesClose}
            onCancel={dropNodesClose}
          />
        )}
      {supportedFilesInfoOpened && (
        <SupportedFilesInfoModal
          opened={supportedFilesInfoOpened}
          onClose={supportedFilesInfoClose}
        />
      )}
    </>
  )
}
