import type {RootState} from "@/app/types"
import {
  MAX_ZOOM_FACTOR,
  MIN_ZOOM_FACTOR,
  COMMANDER_DEFAULT_PAGE_SIZE,
  PAGINATION_DEFAULT_ITEMS_PER_PAGES,
  ZOOM_FACTOR_INIT,
  ZOOM_FACTOR_STEP
} from "@/cconstants"
import type {
  BooleanString,
  CType,
  ClientPage,
  PanelMode,
  ViewOption
} from "@/types"
import type {PanelComponent} from "@/types.d/ui"
import {PayloadAction, createSelector, createSlice} from "@reduxjs/toolkit"
import Cookies from "js-cookie"

import {
  ACCESSIBILITY_COOKIE_KEY,
  HEADER_HEIGHT_ACCESSIBILITY,
  HEADER_HEIGHT_DEFAULT
} from "@/accessibility/constants"

import type {
  FileItemStatus,
  FileItemType,
  FolderType,
  NodeType,
  SortMenuColumn,
  SortMenuDirection
} from "@/types"

import {DialogVisiblity} from "@/types.d/common"

const COLLAPSED_WIDTH = 55
const FULL_WIDTH = 200
const NAVBAR_COLLAPSED_COOKIE = "navbar_collapsed"
const NAVBAR_WIDTH_COOKIE = "navbar_width"
const MAIN_THUMBNAILS_PANEL_OPENED_COOKIE = "main_thumbnails_panel_opened"
const SECONDARY_THUMBNAILS_PANEL_OPENED_COOKIE =
  "secondary_thumbnails_panel_opened"
const MAIN_DOCUMENT_DETAILS_PANEL_OPENED_COOKIE =
  "main_document_details_panel_opened"
const SECONDARY_DOCUMENT_DETAILS_PANEL_OPENED_COOKIE =
  "secondary_document_details_panel_opened"
const HOME_FOLDER_TREE_OPENED_COOKIE = "home_folder_tree_opened"
const HOME_FOLDER_TREE_WIDTH_COOKIE = "home_folder_tree_width"

export const HOME_FOLDER_TREE_WIDTH_MIN = 180
export const HOME_FOLDER_TREE_WIDTH_MAX = 640
export const HOME_FOLDER_TREE_WIDTH_DEFAULT = 240

const SMALL_BOTTOM_MARGIN = 13 /* pixles */

function appShellHeaderHeight(): number {
  return Cookies.get(ACCESSIBILITY_COOKIE_KEY) === "true"
    ? HEADER_HEIGHT_ACCESSIBILITY
    : HEADER_HEIGHT_DEFAULT
}
const EFFECTIVE_VIEWER_MAX_ZOOM_FACTOR = ZOOM_FACTOR_INIT

function clampHomeFolderTreeWidth(width: number): number {
  return Math.min(
    HOME_FOLDER_TREE_WIDTH_MAX,
    Math.max(HOME_FOLDER_TREE_WIDTH_MIN, Math.round(width))
  )
}

type DualArg = {
  mode: PanelMode
  value: number
}

type UpdateFilterType = {
  mode: PanelMode
  filter?: string
}

type LastPageSizeArg = {
  mode: PanelMode
  pageSize: number
}

type CurrentDocVerUpdateArg = {
  mode: PanelMode
  docVerID: string | undefined
}

interface PanelSelectionArg {
  itemID: string
  mode: PanelMode
}

type DragPageStartedArg = {
  pages: Array<ClientPage>
  docID: string
  docParentID: string
}

type DragNodeStartedArg = {
  nodes: string[]
  sourceFolderID: string
}

type SortMenuColumnUpdatedArgs = {
  mode: PanelMode
  column: SortMenuColumn | undefined
}

type SortMenuDirectionUpdatedArgs = {
  mode: PanelMode
  direction: SortMenuDirection
}

type ViewOptionArgs = {
  mode: PanelMode
  viewOption: ViewOption
}

export interface UploaderFileItemArgs {
  item: {
    source: NodeType | null
    target: FolderType
    file_name: string
  }
  status: FileItemStatus
  error: string | null
}

interface NavBarState {
  collapsed: boolean
  width: number
}

interface UploaderState {
  opened: boolean
  files: Array<FileItemType>
}

interface SearchPanelSizes {
  actionPanelHeight: number
}

// i.e Commander's panel, viewer's panel
interface PanelSizes {
  actionPanelHeight: number
  breadcrumbHeight: number
}

interface SizesState {
  outletTopMarginAndPadding: number
  windowInnerHeight: number
  main: PanelSizes
  secondary?: PanelSizes
  search?: SearchPanelSizes
}

interface CurrentNodeArgs {
  id: string
  ctype: CType
  panel: PanelMode
}

interface CurrentPageUpdatedArgs {
  pageNumber: number
  panel: PanelMode
}

interface CurrentNode {
  id: string
  ctype: CType
}

interface ViewerState {
  currentDocumentVersion: number
}

interface DragNDropState {
  /*
  Document pages currently being dragged.
  Pages can be dragged from Viewer's Thumbnails panel.
  Pages can be dropped either in same Thumbnail's panel,
  in another thumbnail panel or inside Commander
  */
  pages: Array<ClientPage> | null
  pagesDocID?: string
  pagesDocParentID?: string
  // IDs of the nodes being dragged
  nodeIDs: string[] | null
  // ID of the folder where drag 'n drop started
  // or in other words: parent node ID of the dragged nodes
  // used for cache tag invalidation
  sourceFolderID?: string
}

interface SearchState {
  /* Query string as entered by user i.e exactly what user sees
  in search box when he/she submits search query */
  query: string
}

export type LastHome = {
  label: string
  home_id: string
  user_id?: string
  group_id?: string
}

export type LastInbox = {
  label: string
  inbox_id: string
  user_id?: string
  group_id?: string
}

interface LastHomeArg {
  mode: PanelMode
  last_home: LastHome
}
interface LastInboxArg {
  mode: PanelMode
  last_inbox: LastInbox
}

export interface UIState {
  uploader: UploaderState
  navbar: NavBarState
  sizes: SizesState
  search?: SearchState
  searchLastPageSize?: number
  dragndrop?: DragNDropState
  currentNodeMain?: CurrentNode
  currentNodeSecondary?: CurrentNode
  mainViewer?: ViewerState
  secondaryViewer?: ViewerState
  currentSharedNode?: CurrentNode
  currentSharedRootID?: string
  mainCommanderSelectedIDs?: Array<string>
  mainCommanderFilter?: string
  mainCommanderLastPageSize?: number
  mainCommanderSortMenuColumn?: SortMenuColumn
  mainCommanderSortMenuDir?: SortMenuDirection
  mainCommanderViewOption?: ViewOption
  /* User may choose between own and group homes
   this field indicates his/her last selection */
  mainCommanderLastHome?: LastHome
  mainCommanderLastInbox?: LastInbox
  secondaryCommanderSelectedIDs?: Array<String>
  secondaryCommanderFilter?: string
  secondaryCommanderLastPageSize?: number
  secondaryCommanderSortMenuColumn?: SortMenuColumn
  secondaryCommanderSortMenuDir?: SortMenuDirection
  secondaryCommanderViewOption?: ViewOption
  /* User may choose between own and group homes
   this field indicates his/her last selection */
  secondaryCommanderLastHome?: LastHome
  secondaryCommanderLastInbox?: LastInbox
  /* Which component should main panel display:
    commander, viewer or search results? */
  mainPanelComponent?: PanelComponent
  secondaryPanelComponent?: PanelComponent
  mainViewerThumbnailsPanelOpen?: boolean
  mainViewerDocumentDetailsPanelOpen?: boolean
  // zoom factor is expressed as percentage.
  // 5 -> means 5%
  // 100 -> means 100% i.e exact fit
  mainViewerZoomFactor?: number
  mainViewerSelectedIDs?: Array<string>
  mainViewerCurrentDocVerID?: string
  /* current page (number) in main viewer */
  mainViewerCurrentPageNumber?: number
  secondaryViewerThumbnailsPanelOpen?: boolean
  secondaryViewerDocumentDetailsPanelOpen?: boolean
  secondaryViewerZoomFactor?: number
  secondaryViewerSelectedIDs?: Array<string>
  secondaryViewerCurrentDocVerID?: string
  /* current page (number) in secondary viewer */
  secondaryViewerCurrentPageNumber?: number
  viewerPageHaveChangedDialogVisibility?: DialogVisiblity
  homeFolderTreeOpen?: boolean
  homeFolderTreeWidth?: number
}

const initialState: UIState = {
  uploader: {
    opened: false,
    files: []
  },
  navbar: {
    collapsed: initial_collapse_value(),
    width: initial_width_value()
  },
  sizes: {
    outletTopMarginAndPadding: 0,
    windowInnerHeight: window.innerHeight,
    main: {
      actionPanelHeight: 0,
      breadcrumbHeight: 0
    }
  },
  mainViewerThumbnailsPanelOpen: mainThumbnailsPanelInitialState(),
  secondaryViewerThumbnailsPanelOpen: secondaryThumbnailsPanelInitialState(),
  mainViewerDocumentDetailsPanelOpen: mainDocumentDetailsPanelInitialState(),
  secondaryViewerDocumentDetailsPanelOpen:
    secondaryDocumentDetailsPanelInitialState(),
  homeFolderTreeOpen: homeFolderTreeOpenInitialState(),
  homeFolderTreeWidth: homeFolderTreeWidthInitialState()
}

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    closeUploader: state => {
      state.uploader.opened = false
      state.uploader.files = []
    },
    uploaderFileItemUpdated: (
      state,
      action: PayloadAction<UploaderFileItemArgs>
    ) => {
      const file_name = action.payload.item.file_name
      const target_id = action.payload.item.target.id
      const itemToAdd = {
        status: action.payload.status,
        error: action.payload.error,
        file_name: action.payload.item.file_name,
        source: action.payload.item.source,
        target: action.payload.item.target
      }

      const found = state.uploader.files.find(
        i => i.file_name == file_name && i.target.id == target_id
      )

      if (!found) {
        state.uploader.files.push(itemToAdd)
        state.uploader.opened = true
        return
      }

      const newItems = state.uploader.files.map(i => {
        if (i.file_name == file_name && i.target.id == target_id) {
          return itemToAdd
        } else {
          return i
        }
      })

      state.uploader.files = newItems
      state.uploader.opened = true
    }, // end of uploaderFileItemUpdated
    // ---------------------------------------------------------
    toggleNavBar(state) {
      if (state.navbar.collapsed) {
        state.navbar.collapsed = false
        state.navbar.width = FULL_WIDTH
        Cookies.set(NAVBAR_COLLAPSED_COOKIE, "false")
        Cookies.set(NAVBAR_WIDTH_COOKIE, `${FULL_WIDTH}`)
      } else {
        state.navbar.collapsed = true
        state.navbar.width = COLLAPSED_WIDTH
        Cookies.set(NAVBAR_COLLAPSED_COOKIE, "true")
        Cookies.set(NAVBAR_WIDTH_COOKIE, `${COLLAPSED_WIDTH}`)
      }
    },
    homeFolderTreeToggled(state) {
      const new_value = !Boolean(state.homeFolderTreeOpen)
      state.homeFolderTreeOpen = new_value
      Cookies.set(HOME_FOLDER_TREE_OPENED_COOKIE, new_value ? "true" : "false")
    },
    homeFolderTreeWidthSet(state, action: PayloadAction<number>) {
      const w = clampHomeFolderTreeWidth(action.payload)
      state.homeFolderTreeWidth = w
      Cookies.set(HOME_FOLDER_TREE_WIDTH_COOKIE, `${w}`)
    },
    updateOutlet(state, action: PayloadAction<number>) {
      state.sizes.windowInnerHeight = window.innerHeight
      state.sizes.outletTopMarginAndPadding = action.payload
    },
    updateActionPanel(state, action: PayloadAction<DualArg>) {
      const {value, mode} = action.payload

      state.sizes.windowInnerHeight = window.innerHeight
      if (mode == "main") {
        // main panel
        state.sizes.main.actionPanelHeight = value
      } else if (mode == "secondary") {
        // secondary panel
        if (state.sizes.secondary) {
          state.sizes.secondary.actionPanelHeight = value
        } else {
          state.sizes.secondary = {
            breadcrumbHeight: 0,
            actionPanelHeight: value
          }
        }
      }
    },
    updateBreadcrumb(state, action: PayloadAction<DualArg>) {
      const {value, mode} = action.payload

      state.sizes.windowInnerHeight = window.innerHeight
      if (mode == "main") {
        // main panel
        state.sizes.main.breadcrumbHeight = value
      } else if (mode == "secondary") {
        // secondary panel
        if (state.sizes.secondary) {
          state.sizes.secondary.breadcrumbHeight = value
        } else {
          state.sizes.secondary = {
            breadcrumbHeight: value,
            actionPanelHeight: 0
          }
        }
      }
    },
    updateSearchActionPanel(state, action: PayloadAction<number>) {
      state.sizes.windowInnerHeight = window.innerHeight
      if (state.sizes.search) {
        state.sizes.search.actionPanelHeight = action.payload
      } else {
        state.sizes.search = {
          actionPanelHeight: action.payload
        }
      }
    },
    searchResultsLastPageSizeUpdated(state, action: PayloadAction<number>) {
      state.searchLastPageSize = action.payload
    },
    mainPanelSwitchedToSearchResults(state, action: PayloadAction<string>) {
      const query = action.payload
      state.mainPanelComponent = "searchResults"
      state.search = {
        query: query
      }
      state.currentNodeMain = undefined
    },
    mainPanelComponentUpdated(state, action: PayloadAction<PanelComponent>) {
      state.mainPanelComponent = action.payload
    },
    currentNodeChanged(state, action: PayloadAction<CurrentNodeArgs>) {
      const payload = action.payload
      if (payload.panel == "main") {
        state.currentNodeMain = {
          id: payload.id,
          ctype: payload.ctype
        }
        if (payload.ctype == "folder") {
          state.mainPanelComponent = "commander"
        }
        if (payload.ctype == "document") {
          state.mainPanelComponent = "viewer"
        }
        state.mainCommanderSelectedIDs = []
        return
      }

      // mode == secondary
      state.currentNodeSecondary = {
        id: payload.id,
        ctype: payload.ctype
      }
      if (payload.ctype == "folder") {
        state.secondaryPanelComponent = "commander"
      }
      if (payload.ctype == "document") {
        state.secondaryPanelComponent = "viewer"
      }
      state.secondaryCommanderSelectedIDs = []
    }, // end of currentNodeChanged
    currentSharedNodeChanged(state, action: PayloadAction<CurrentNodeArgs>) {
      const payload = action.payload

      state.currentSharedNode = {
        id: payload.id,
        ctype: payload.ctype
      }
      if (payload.ctype == "folder") {
        state.mainPanelComponent = "sharedCommander"
      }
      if (payload.ctype == "document") {
        state.mainPanelComponent = "sharedViewer"
      }
    }, // end of currentSharedNodeChanged
    currentSharedNodeRootChanged(
      state,
      action: PayloadAction<string | undefined>
    ) {
      state.currentSharedRootID = action.payload
    },
    //------------------------------------------------------------------
    secondaryPanelOpened(state, action: PayloadAction<PanelComponent>) {
      state.secondaryPanelComponent = action.payload
    },

    secondaryPanelClosed(state) {
      state.secondaryPanelComponent = undefined
    },

    commanderSelectionNodeAdded(
      state,
      action: PayloadAction<PanelSelectionArg>
    ) {
      const mode = action.payload.mode
      const itemID = action.payload.itemID
      if (mode == "main") {
        if (state.mainCommanderSelectedIDs) {
          state.mainCommanderSelectedIDs.push(itemID)
        } else {
          state.mainCommanderSelectedIDs = [itemID]
        }
        return
      }

      // mode == secondary
      if (state.secondaryCommanderSelectedIDs) {
        state.secondaryCommanderSelectedIDs.push(itemID)
      } else {
        state.secondaryCommanderSelectedIDs = [itemID]
      }
    }, // end of commanderSelectionNodeAdded
    //------------------------------------------------------------------
    commanderSelectionNodeRemoved(
      state,
      action: PayloadAction<PanelSelectionArg>
    ) {
      const mode = action.payload.mode
      const itemID = action.payload.itemID
      if (mode == "main") {
        if (state.mainCommanderSelectedIDs) {
          const newValues = state.mainCommanderSelectedIDs.filter(
            i => i != itemID
          )
          state.mainCommanderSelectedIDs = newValues
        }

        return
      }
      // secondary
      if (state.secondaryCommanderSelectedIDs) {
        const newValues = state.secondaryCommanderSelectedIDs.filter(
          i => i != itemID
        )
        state.secondaryCommanderSelectedIDs = newValues
      }
    }, // commanderSelectionNodeRemoved
    //------------------------------------------------------------------
    commanderSelectionCleared(state, action: PayloadAction<PanelMode>) {
      const mode = action.payload

      if (mode == "main") {
        state.mainCommanderSelectedIDs = []
        return
      }
      // secondary
      state.secondaryCommanderSelectedIDs = []
    }, // end of commanderSelectionCleared
    //-------------------------------------------
    filterUpdated: (state, action: PayloadAction<UpdateFilterType>) => {
      const {mode, filter} = action.payload
      if (mode == "main") {
        state.mainCommanderFilter = filter
        return
      }

      state.secondaryCommanderFilter = filter
    },
    commanderAllSelectionsCleared(state) {
      state.mainCommanderSelectedIDs = []
      state.secondaryCommanderSelectedIDs = []
    },
    commanderLastPageSizeUpdated(
      state,
      action: PayloadAction<LastPageSizeArg>
    ) {
      const {mode, pageSize} = action.payload
      if (mode == "main") {
        state.mainCommanderLastPageSize = pageSize
        return
      }

      state.secondaryCommanderLastPageSize = pageSize
    },
    commanderSortMenuColumnUpdated(
      state,
      action: PayloadAction<SortMenuColumnUpdatedArgs>
    ) {
      const {mode, column} = action.payload
      if (mode == "main") {
        state.mainCommanderSortMenuColumn = column
      } else {
        state.secondaryCommanderSortMenuColumn = column
      }
    },
    commanderSortMenuDirectionUpdated(
      state,
      action: PayloadAction<SortMenuDirectionUpdatedArgs>
    ) {
      const {mode, direction} = action.payload
      if (mode == "main") {
        state.mainCommanderSortMenuDir = direction
      } else {
        state.secondaryCommanderSortMenuDir = direction
      }
    },
    commanderViewOptionUpdated(state, action: PayloadAction<ViewOptionArgs>) {
      const {mode, viewOption} = action.payload
      if (mode == "main") {
        state.mainCommanderViewOption = viewOption
      } else {
        state.secondaryCommanderViewOption = viewOption
      }
    },
    lastHomeUpdated(state, action: PayloadAction<LastHomeArg>) {
      const {mode, last_home} = action.payload
      if (mode == "main") {
        state.mainCommanderLastHome = last_home
      } else {
        state.secondaryCommanderLastHome = last_home
      }
    },
    lastInboxUpdated(state, action: PayloadAction<LastInboxArg>) {
      const {mode, last_inbox} = action.payload
      if (mode == "main") {
        state.mainCommanderLastInbox = last_inbox
      } else {
        state.secondaryCommanderLastInbox = last_inbox
      }
    },
    viewerThumbnailsPanelToggled(state, action: PayloadAction<PanelMode>) {
      const mode = action.payload

      if (mode == "main") {
        const new_value = !Boolean(state.mainViewerThumbnailsPanelOpen)
        state.mainViewerThumbnailsPanelOpen = new_value
        if (new_value) {
          Cookies.set(MAIN_THUMBNAILS_PANEL_OPENED_COOKIE, "true")
        } else {
          Cookies.set(MAIN_THUMBNAILS_PANEL_OPENED_COOKIE, "false")
        }
        return
      }
      const new_value = !Boolean(state.secondaryViewerThumbnailsPanelOpen)
      state.secondaryViewerThumbnailsPanelOpen = new_value
      if (new_value) {
        Cookies.set(SECONDARY_THUMBNAILS_PANEL_OPENED_COOKIE, "true")
      } else {
        Cookies.set(SECONDARY_THUMBNAILS_PANEL_OPENED_COOKIE, "false")
      }
    },
    viewerDocumentDetailsPanelToggled(state, action: PayloadAction<PanelMode>) {
      const mode = action.payload

      if (mode == "main") {
        const new_value = !Boolean(state.mainViewerDocumentDetailsPanelOpen)
        state.mainViewerDocumentDetailsPanelOpen = new_value
        if (new_value) {
          Cookies.set(MAIN_DOCUMENT_DETAILS_PANEL_OPENED_COOKIE, "true")
        } else {
          Cookies.set(MAIN_DOCUMENT_DETAILS_PANEL_OPENED_COOKIE, "false")
        }
        return
      }
      const new_value = !Boolean(state.secondaryViewerDocumentDetailsPanelOpen)
      state.secondaryViewerDocumentDetailsPanelOpen = new_value
      if (new_value) {
        Cookies.set(SECONDARY_DOCUMENT_DETAILS_PANEL_OPENED_COOKIE, "true")
      } else {
        Cookies.set(SECONDARY_DOCUMENT_DETAILS_PANEL_OPENED_COOKIE, "false")
      }
    },
    zoomFactorIncremented(state, action: PayloadAction<PanelMode>) {
      const mode = action.payload
      if (mode == "main") {
        const zoom = state.mainViewerZoomFactor || ZOOM_FACTOR_INIT
        state.mainViewerZoomFactor = Math.min(
          EFFECTIVE_VIEWER_MAX_ZOOM_FACTOR,
          zoom + ZOOM_FACTOR_STEP
        )
      }
      if (mode == "secondary") {
        const zoom = state.secondaryViewerZoomFactor || ZOOM_FACTOR_INIT
        state.secondaryViewerZoomFactor = Math.min(
          EFFECTIVE_VIEWER_MAX_ZOOM_FACTOR,
          zoom + ZOOM_FACTOR_STEP
        )
      }
    },
    zoomFactorDecremented(state, action: PayloadAction<PanelMode>) {
      const mode = action.payload
      if (mode == "main") {
        const zoom = state.mainViewerZoomFactor || ZOOM_FACTOR_INIT
        state.mainViewerZoomFactor = Math.max(
          MIN_ZOOM_FACTOR,
          zoom - ZOOM_FACTOR_STEP
        )
      }
      if (mode == "secondary") {
        const zoom = state.secondaryViewerZoomFactor || ZOOM_FACTOR_INIT
        state.secondaryViewerZoomFactor = Math.max(
          MIN_ZOOM_FACTOR,
          zoom - ZOOM_FACTOR_STEP
        )
      }
    },
    zoomFactorReseted(state, action: PayloadAction<PanelMode>) {
      const mode = action.payload
      if (mode == "main") {
        state.mainViewerZoomFactor = ZOOM_FACTOR_INIT
      }
      if (mode == "secondary") {
        state.secondaryViewerZoomFactor = ZOOM_FACTOR_INIT
      }
    },
    viewerSelectionPageAdded(state, action: PayloadAction<PanelSelectionArg>) {
      const mode = action.payload.mode
      const itemID = action.payload.itemID
      if (mode == "main") {
        if (state.mainViewerSelectedIDs) {
          state.mainViewerSelectedIDs.push(itemID)
        } else {
          state.mainViewerSelectedIDs = [itemID]
        }
        return
      }

      // mode == secondary
      if (state.secondaryViewerSelectedIDs) {
        state.secondaryViewerSelectedIDs.push(itemID)
      } else {
        state.secondaryViewerSelectedIDs = [itemID]
      }
    },
    viewerSelectionPageRemoved(
      state,
      action: PayloadAction<PanelSelectionArg>
    ) {
      const mode = action.payload.mode
      const itemID = action.payload.itemID
      if (mode == "main") {
        if (state.mainViewerSelectedIDs) {
          const newValues = state.mainViewerSelectedIDs.filter(i => i != itemID)
          state.mainViewerSelectedIDs = newValues
        }

        return
      }
      // secondary
      if (state.secondaryViewerSelectedIDs) {
        const newValues = state.secondaryViewerSelectedIDs.filter(
          i => i != itemID
        )
        state.secondaryViewerSelectedIDs = newValues
      }
    },
    viewerSelectionCleared(state, action: PayloadAction<PanelMode>) {
      const mode = action.payload

      if (mode == "main") {
        state.mainViewerSelectedIDs = []
        return
      }
      // secondary
      state.secondaryViewerSelectedIDs = []
    },
    viewerCurrentPageUpdated(
      state,
      action: PayloadAction<CurrentPageUpdatedArgs>
    ) {
      const {pageNumber, panel} = action.payload

      if (panel == "main") {
        state.mainViewerCurrentPageNumber = pageNumber
        return
      }

      state.secondaryViewerCurrentPageNumber = pageNumber
    },
    currentDocVerUpdated(state, action: PayloadAction<CurrentDocVerUpdateArg>) {
      const {mode, docVerID} = action.payload
      if (mode == "main") {
        state.mainViewerCurrentDocVerID = docVerID
      } else {
        state.secondaryViewerCurrentDocVerID = docVerID
      }
    },
    dragPagesStarted(state, action: PayloadAction<DragPageStartedArg>) {
      const {pages, docID, docParentID} = action.payload
      if (state.dragndrop) {
        state.dragndrop.pages = pages
        state.dragndrop.pagesDocID = docID
        state.dragndrop.pagesDocParentID = docParentID
      } else {
        state.dragndrop = {
          pages: pages,
          pagesDocID: docID,
          pagesDocParentID: docParentID,
          nodeIDs: null
        }
      }
    },
    dragNodesStarted(state, action: PayloadAction<DragNodeStartedArg>) {
      const {nodes, sourceFolderID} = action.payload

      if (state.dragndrop) {
        state.dragndrop.nodeIDs = nodes
        state.dragndrop.sourceFolderID = sourceFolderID
      } else {
        state.dragndrop = {
          nodeIDs: nodes,
          sourceFolderID: sourceFolderID,
          pages: null
        }
      }
    },
    dragEnded(state) {
      if (state.dragndrop) {
        state.dragndrop = undefined
      }
    },
    viewerPageHaveChangedDialogVisibilityChanged(
      state,
      action: PayloadAction<{visibility: DialogVisiblity}>
    ) {
      const newVisibility = action.payload.visibility
      state.viewerPageHaveChangedDialogVisibility = newVisibility
    }
  }
})

export const {
  closeUploader,
  uploaderFileItemUpdated,
  toggleNavBar,
  homeFolderTreeToggled,
  homeFolderTreeWidthSet,
  updateOutlet,
  updateActionPanel,
  updateSearchActionPanel,
  updateBreadcrumb,
  currentNodeChanged,
  currentSharedNodeChanged,
  currentSharedNodeRootChanged,
  mainPanelComponentUpdated,
  searchResultsLastPageSizeUpdated,
  /* Main panel switched to show search results.
  This happens when user clicks enter in search field
  in the header */
  mainPanelSwitchedToSearchResults,
  secondaryPanelClosed,
  secondaryPanelOpened,
  commanderSelectionNodeAdded,
  commanderSelectionNodeRemoved,
  commanderSelectionCleared,
  commanderAllSelectionsCleared,
  filterUpdated,
  commanderLastPageSizeUpdated,
  commanderSortMenuColumnUpdated,
  commanderSortMenuDirectionUpdated,
  commanderViewOptionUpdated,
  viewerThumbnailsPanelToggled,
  viewerDocumentDetailsPanelToggled,
  zoomFactorIncremented,
  zoomFactorDecremented,
  zoomFactorReseted,
  viewerSelectionPageAdded,
  viewerSelectionPageRemoved,
  viewerSelectionCleared,
  viewerCurrentPageUpdated,
  currentDocVerUpdated,
  dragPagesStarted,
  dragNodesStarted,
  dragEnded,
  lastHomeUpdated,
  lastInboxUpdated,
  viewerPageHaveChangedDialogVisibilityChanged
} = uiSlice.actions
export default uiSlice.reducer

export const selectOpened = (state: RootState): boolean =>
  state.ui.uploader.opened

export const selectFiles = (state: RootState): Array<FileItemType> =>
  state.ui.uploader.files

export const selectNavBarCollapsed = (state: RootState) =>
  state.ui.navbar.collapsed
export const selectNavBarWidth = (state: RootState) => state.ui.navbar.width

export const selectContentHeight = (state: RootState, mode: PanelMode) => {
  let height: number = state.ui.sizes.windowInnerHeight

  height -= state.ui.sizes.outletTopMarginAndPadding

  if (mode == "main") {
    height -= state.ui.sizes.main.actionPanelHeight
    height -= state.ui.sizes.main.breadcrumbHeight
  } else if (mode == "secondary") {
    if (state.ui.sizes.secondary) {
      height -= state.ui.sizes.secondary.actionPanelHeight
      height -= state.ui.sizes.secondary.breadcrumbHeight
    }
  }

  /* Let there be a small margin at the bottom of the viewport */
  height -= SMALL_BOTTOM_MARGIN
  return height
}

export const selectSearchContentHeight = (state: RootState) => {
  let height: number = state.ui.sizes.windowInnerHeight

  height -= state.ui.sizes.outletTopMarginAndPadding

  if (state.ui.sizes.search) {
    height -= state.ui.sizes.search.actionPanelHeight
  }

  /* Let there be a small margin at the bottom of the viewport */
  height -= SMALL_BOTTOM_MARGIN

  return height
}

export const selectSearchPageHeight = (state: RootState) => {
  let height: number = state.ui.sizes.windowInnerHeight

  height -= appShellHeaderHeight()
  height -= state.ui.sizes.outletTopMarginAndPadding
  height -= SMALL_BOTTOM_MARGIN

  return height
}

/** Vertical space for the home portal folder tree sidebar (AppShell main margin-bottom). */
export const selectHomeFolderTreeSidebarHeight = (state: RootState) => {
  const MAIN_MARGIN_BOTTOM = 8
  return selectSearchPageHeight(state) - MAIN_MARGIN_BOTTOM
}

export const selectCurrentNode = (
  state: RootState,
  mode: PanelMode
): CurrentNode | undefined => {
  if (mode == "main") {
    return state.ui.currentNodeMain
  }

  return state.ui.currentNodeSecondary
}

export const selectCurrentNodeID = (state: RootState, mode: PanelMode) => {
  if (mode == "main") {
    return state.ui.currentNodeMain?.id
  }

  return state.ui.currentNodeSecondary?.id
}

export const selectCurrentSharedNodeID = (state: RootState) => {
  return state.ui.currentSharedNode?.id
}

export const selectCurrentSharedRootID = (state: RootState) => {
  return state.ui.currentSharedRootID
}

export const selectCurrentNodeCType = (state: RootState, mode: PanelMode) => {
  if (mode == "main") {
    return state.ui.currentNodeMain?.ctype
  }

  return state.ui.currentNodeSecondary?.ctype
}

export const selectCurrentDocumentID = (state: RootState, mode: PanelMode) => {
  if (mode == "main") {
    const node = state.ui.currentNodeMain
    if (node?.ctype == "document") {
      return node.id
    }
  }

  const node = state.ui.currentNodeSecondary
  if (node?.ctype == "document") {
    return node.id
  }
}

export const selectPanelComponent = (state: RootState, mode: PanelMode) => {
  if (mode == "main") {
    return state.ui.mainPanelComponent
  }

  return state.ui.secondaryPanelComponent
}

export const selectOtherPanelComponent = (
  state: RootState,
  mode: PanelMode
) => {
  /* select other panel (as opposite to current one)
  if mode == "main" => selects "secondary" panel component
  if mode == "secondary" => select "main" panel component
  */
  if (mode == "main") {
    return state.ui.secondaryPanelComponent
  }

  return state.ui.mainPanelComponent
}

export const selectSelectedNodeIds = (state: RootState, mode: PanelMode) => {
  if (mode == "main") {
    return state.ui.mainCommanderSelectedIDs || []
  }

  return state.ui.secondaryCommanderSelectedIDs || []
}

export const selectSelectedNodesCount = createSelector(
  selectSelectedNodeIds,
  selectedIds => {
    if (!selectedIds) {
      return 0
    }

    return selectedIds.length
  }
)

export const selectOneSelectedSharedNode = (
  _state: RootState,
  _mode: PanelMode
): undefined | NodeType => {
  return undefined
}

export const selectFilterText = (state: RootState, mode: PanelMode) => {
  if (mode == "main") {
    return state.ui.mainCommanderFilter
  }

  return state.ui.secondaryCommanderFilter
}

export const selectThumbnailsPanelOpen = (
  state: RootState,
  mode: PanelMode
) => {
  if (mode == "main") {
    return Boolean(state.ui.mainViewerThumbnailsPanelOpen)
  }

  return Boolean(state.ui.secondaryViewerThumbnailsPanelOpen)
}

export const selectHomeFolderTreeOpen = (state: RootState) => {
  return state.ui.homeFolderTreeOpen !== false
}

export const selectHomeFolderTreeWidth = (state: RootState) => {
  const w = state.ui.homeFolderTreeWidth
  if (typeof w === "number" && w > 0) {
    return clampHomeFolderTreeWidth(w)
  }
  return HOME_FOLDER_TREE_WIDTH_DEFAULT
}

export const selectDocumentDetailsPanelOpen = (
  state: RootState,
  mode: PanelMode
) => {
  if (mode == "main") {
    return Boolean(state.ui.mainViewerDocumentDetailsPanelOpen)
  }

  return Boolean(state.ui.secondaryViewerDocumentDetailsPanelOpen)
}

export const selectLastPageSize = (
  state: RootState,
  mode: PanelMode
): number => {
  if (mode == "main") {
    return (
      state.ui.mainCommanderLastPageSize || COMMANDER_DEFAULT_PAGE_SIZE
    )
  }

  return (
    state.ui.secondaryCommanderLastPageSize || COMMANDER_DEFAULT_PAGE_SIZE
  )
}

export const selectCommanderSortMenuColumn = (
  state: RootState,
  mode: PanelMode
): SortMenuColumn | undefined => {
  const column =
    mode == "main"
      ? state.ui.mainCommanderSortMenuColumn
      : state.ui.secondaryCommanderSortMenuColumn
  if ((column as string | undefined) === "ctype") {
    return "file_type"
  }
  return column
}

export const selectCommanderSortMenuDir = (
  state: RootState,
  mode: PanelMode
): SortMenuDirection => {
  if (mode == "main") {
    return state.ui.mainCommanderSortMenuDir || "az"
  }

  return state.ui.secondaryCommanderSortMenuDir || "az"
}

export const selectCommanderViewOption = (
  state: RootState,
  mode: PanelMode
): ViewOption => {
  if (mode == "main") {
    return state.ui.mainCommanderViewOption || "tile"
  }

  return state.ui.secondaryCommanderViewOption || "tile"
}

export const selectZoomFactor = (state: RootState, mode: PanelMode) => {
  const clampZoom = (value: number) =>
    Math.max(
      MIN_ZOOM_FACTOR,
      Math.min(EFFECTIVE_VIEWER_MAX_ZOOM_FACTOR, value)
    )

  if (mode == "main") {
    return clampZoom(state.ui.mainViewerZoomFactor || ZOOM_FACTOR_INIT)
  }

  return clampZoom(state.ui.secondaryViewerZoomFactor || ZOOM_FACTOR_INIT)
}

export const selectCurrentDocVerID = (state: RootState, mode: PanelMode) => {
  if (mode == "main") {
    return state.ui.mainViewerCurrentDocVerID
  }

  return state.ui.secondaryViewerCurrentDocVerID
}

export const selectCurrentDocVer = (state: RootState, mode: PanelMode) => {
  if (mode == "main") {
    if (state.ui.mainViewerCurrentDocVerID) {
      return state.docVers.entities[state.ui.mainViewerCurrentDocVerID]
    }
  }

  if (state.ui.secondaryViewerCurrentDocVerID) {
    return state.docVers.entities[state.ui.secondaryViewerCurrentDocVerID]
  }
}

export const selectDraggedPages = (state: RootState) =>
  state.ui.dragndrop?.pages

export const selectDraggedPagesDocID = (state: RootState) =>
  state.ui.dragndrop?.pagesDocID

export const selectDraggedPagesDocParentID = (state: RootState) =>
  state.ui.dragndrop?.pagesDocParentID

export const selectDraggedNodeIDs = (state: RootState) =>
  state.ui.dragndrop?.nodeIDs

export const selectDraggedNodes = createSelector(
  /** Input selectors */
  [(state: RootState) => state.nodes.entities, selectDraggedNodeIDs],
  (
    entities: Record<string, NodeType>,
    draggedNodeIDs: string[] | undefined | null
  ) => {
    /** Returns `NodeType` objects of the nodes
     * currently being dragged */
    return Object.values(entities).filter((n: NodeType) =>
      draggedNodeIDs?.includes(n.id)
    )
  }
)

export const selectDraggedNodesSourceFolderID = (state: RootState) => {
  return state.ui.dragndrop?.sourceFolderID
}

export const selectSearchQuery = (state: RootState) => state.ui.search?.query

export const selectSearchLastPageSize = (state: RootState): number =>
  state.ui.searchLastPageSize || PAGINATION_DEFAULT_ITEMS_PER_PAGES

export const selectDocumentCurrentPage = (
  state: RootState,
  mode: PanelMode
) => {
  if (mode == "main") {
    return state.ui.mainViewerCurrentPageNumber
  }

  return state.ui.secondaryViewerCurrentPageNumber
}

export const selectLastHome = (state: RootState, mode: PanelMode) => {
  if (mode == "main") {
    return state.ui.mainCommanderLastHome
  }

  return state.ui.secondaryCommanderLastHome
}

export const selectLastInbox = (state: RootState, mode: PanelMode) => {
  if (mode == "main") {
    return state.ui.mainCommanderLastInbox
  }

  return state.ui.secondaryCommanderLastInbox
}

export const selectViewerPagesHaveChangedDialogVisibility = (
  state: RootState
) => {
  return state.ui.viewerPageHaveChangedDialogVisibility || "closed"
}

/* Load initial collapse state value from cookie */
function initial_collapse_value(): boolean {
  const collapsed = Cookies.get(NAVBAR_COLLAPSED_COOKIE) as BooleanString

  if (collapsed == "true") {
    return true
  }

  return false
}

/* Load initial width value from cookie */
function initial_width_value(): number {
  const width = Cookies.get(NAVBAR_WIDTH_COOKIE)

  if (width) {
    const ret = parseInt(width)
    if (ret > 0) {
      return ret
    } else {
      return FULL_WIDTH
    }
  }

  return FULL_WIDTH
}

function mainThumbnailsPanelInitialState(): boolean {
  const is_opened = Cookies.get(
    MAIN_THUMBNAILS_PANEL_OPENED_COOKIE
  ) as BooleanString

  if (is_opened == "true") {
    return true
  }

  return false
}

function secondaryThumbnailsPanelInitialState(): boolean {
  const is_opened = Cookies.get(
    SECONDARY_THUMBNAILS_PANEL_OPENED_COOKIE
  ) as BooleanString

  if (is_opened == "true") {
    return true
  }

  return false
}

function mainDocumentDetailsPanelInitialState(): boolean {
  const is_opened = Cookies.get(
    MAIN_DOCUMENT_DETAILS_PANEL_OPENED_COOKIE
  ) as BooleanString

  if (is_opened == "true") {
    return true
  }

  return false
}

function secondaryDocumentDetailsPanelInitialState(): boolean {
  const is_opened = Cookies.get(
    SECONDARY_DOCUMENT_DETAILS_PANEL_OPENED_COOKIE
  ) as BooleanString

  if (is_opened == "true") {
    return true
  }

  return false
}

function homeFolderTreeOpenInitialState(): boolean {
  const v = Cookies.get(HOME_FOLDER_TREE_OPENED_COOKIE) as BooleanString
  if (v === "false") {
    return false
  }
  return true
}

function homeFolderTreeWidthInitialState(): number {
  const raw = Cookies.get(HOME_FOLDER_TREE_WIDTH_COOKIE)
  if (raw) {
    const n = parseInt(raw, 10)
    if (!Number.isNaN(n)) {
      return clampHomeFolderTreeWidth(n)
    }
  }
  return HOME_FOLDER_TREE_WIDTH_DEFAULT
}
