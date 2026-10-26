import {RootState} from "@/app/types"
import type {
  ClientDocumentVersion,
  ClientPage,
  DroppedThumbnailPosition,
  ServerNotifDocumentMoved
} from "@/types"
import {PanelMode} from "@/types"
import {UUID} from "@/types.d/common"
import {contains_every, reorder} from "@/utils"
import {notifications} from "@mantine/notifications"
import {
  PayloadAction,
  createEntityAdapter,
  createSelector,
  createSlice
} from "@reduxjs/toolkit"
import {
  DOC_VER_PAGINATION_PAGE_BATCH_SIZE,
  DOC_VER_PAGINATION_THUMBNAIL_BATCH_SIZE
} from "../constants"
import type {DocumentVersion} from "../types"
import {clientDVFromDV} from "../utils"
import {apiSliceWithDocuments} from "./apiSlice"

const EMPTY_ARRAY: any[] = []

function pagesDiffer(a: ClientPage[], b: ClientPage[]): boolean {
  if (a.length !== b.length) return true

  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].number !== b[i].number ||
      a[i].angle !== b[i].angle
    ) {
      return true
    }
  }

  return false
}

interface PaginationUpdated {
  pageNumber: number
  pageSize: number
  docVerID: UUID
}

type PageDroppedArgs = {
  sources: ClientPage[]
  target: ClientPage
  targetDocVerID: string
  position: DroppedThumbnailPosition
}

type PageRotatedArgs = {
  sources: ClientPage[]
  angle: number
  targetDocVerID: string
}

type PageDeletedArgs = {
  sources: ClientPage[]
  targetDocVerID: string
}

export const docVerAdapter = createEntityAdapter<ClientDocumentVersion>()
const initialState = docVerAdapter.getInitialState()

/**
 * This slice is used for storing page metadata i.e. page
 * position and rotation
 */
const docVersSlice = createSlice({
  name: "documentVersion",
  initialState,
  reducers: {
    docVerPaginationUpdated(state, action: PayloadAction<PaginationUpdated>) {
      const {pageNumber, pageSize, docVerID} = action.payload
      const docVer = state.entities[docVerID]
      if (!docVer) return
      docVer.pagination = {page_number: pageNumber, per_page: pageSize}
    },
    docVerThumbnailsPaginationUpdated(
      state,
      action: PayloadAction<PaginationUpdated>
    ) {
      const {pageNumber, pageSize, docVerID} = action.payload
      const docVer = state.entities[docVerID]
      if (!docVer) return
      docVer.thumbnailsPagination = {
        page_number: pageNumber,
        per_page: pageSize
      }
    },
    pagesDroppedInDoc(state, action: PayloadAction<PageDroppedArgs>) {
      /* Handles reordering of pages WITHIN the same document version.
         Cross-docver transfers are handled in the transferPages action. */
      const {targetDocVerID, sources, target, position} = action.payload
      const docVer = state.entities[targetDocVerID]
      if (!docVer) return
      const page_ids = docVer.pages.map(p => p.id)
      const source_ids = sources.map(p => p.id)
      if (!contains_every({container: page_ids, items: source_ids})) return
      docVer.pages = reorder<ClientPage, string>({
        arr: docVer.pages,
        source_ids,
        target_id: target.id,
        position,
        idf: (val: ClientPage) => val.id
      })
    },
    pagesRotated(state, action: PayloadAction<PageRotatedArgs>) {
      const {targetDocVerID, sources, angle} = action.payload
      const docVer = state.entities[targetDocVerID]
      if (!docVer) return
      const rotatedIDs = new Set(sources.map(s => s.id))
      docVer.pages = docVer.pages.map(p =>
        rotatedIDs.has(p.id) ? {...p, angle: p.angle + angle} : p
      )
    },
    pagesReseted(state, action: PayloadAction<string>) {
      const docVer = state.entities[action.payload]
      if (!docVer) return
      docVer.pages = docVer.initial_pages.map(page => ({...page}))
    },
    pagesDeleted(state, action: PayloadAction<PageDeletedArgs>) {
      const {sources, targetDocVerID} = action.payload
      const docVer = state.entities[targetDocVerID]
      if (!docVer) return
      const pageIDsToBeDeleted = new Set(sources.map(s => s.id))
      docVer.pages = docVer.pages.filter(p => !pageIDsToBeDeleted.has(p.id))
    },
    documentMovedNotifReceived(
      _state,
      action: PayloadAction<ServerNotifDocumentMoved>
    ) {
      notifications.show({
        withBorder: true,
        message: `Document title updated to ${action.payload.new_document_title}`
      })
    },
    addClientDocVersion: (
      state,
      action: PayloadAction<ClientDocumentVersion>
    ) => {
      docVerAdapter.upsertOne(state, action.payload)
    },
    addDocVersion: (state, action: PayloadAction<DocumentVersion>) => {
      const dv = action.payload
      const cdv = clientDVFromDV(dv)
      docVerAdapter.upsertOne(state, cdv)
    }
  },
  extraReducers(builder) {
    builder.addMatcher(
      apiSliceWithDocuments.endpoints.getDocLastVersion.matchFulfilled,
      (state, action: PayloadAction<DocumentVersion>) => {
        const v: DocumentVersion = action.payload
        const ver = clientDVFromDV(v)
        const current = state.entities[ver.id]

        if (current && pagesDiffer(current.initial_pages, current.pages)) {
          docVerAdapter.upsertOne(state, {
            ...ver,
            pages: current.pages,
            initial_pages: current.initial_pages
          })
          return
        }

        docVerAdapter.upsertOne(state, ver)
      }
    )
  }
})

export const {
  pagesDroppedInDoc,
  pagesRotated,
  pagesReseted,
  pagesDeleted,
  documentMovedNotifReceived,
  docVerPaginationUpdated,
  docVerThumbnailsPaginationUpdated,
  addClientDocVersion,
  addDocVersion
} = docVersSlice.actions
export default docVersSlice.reducer

export const selectDocVerByID = (state: RootState, docVerID?: string) => {
  if (docVerID) {
    return state.docVers.entities[docVerID]
  }

  return undefined
}

export const {selectEntities: selectDocVerEntities} =
  docVerAdapter.getSelectors((state: RootState) => state.docVers)

export const selectCurrentPages = createSelector([selectDocVerByID], docVer => {
  if (docVer) {
    return docVer.pages
  }

  return []
})

export const selectAllPages = createSelector(
  [
    (state: RootState) => state.docVers.entities,
    (_: RootState, docVerID?: UUID) => docVerID
  ],
  (entities, docVerID) => {
    if (!docVerID) return EMPTY_ARRAY

    const pages = entities[docVerID]?.pages
    if (!pages || pages.length === 0) return EMPTY_ARRAY

    return pages
  }
)

export const selectInitialPages = createSelector(
  [
    (state: RootState) => state.docVers.entities,
    (_: RootState, docVerID?: UUID) => docVerID
  ],
  (entities, docVerID): ClientPage[] => {
    if (!docVerID) return EMPTY_ARRAY

    const pages = entities[docVerID]?.initial_pages
    if (!pages || pages.length === 0) return EMPTY_ARRAY

    return pages
  }
)

export const selectDocumentVersionOCRLang = (
  state: RootState,
  mode: PanelMode
) => {
  if (mode == "main") {
    const docVerID = state.ui.mainViewerCurrentDocVerID
    if (docVerID) {
      const docVer = state.docVers.entities[docVerID]
      if (docVer) {
        return docVer.lang
      }
    }
  }

  if (mode == "secondary") {
    const docVerID = state.ui.secondaryViewerCurrentDocVerID
    if (docVerID) {
      const docVer = state.docVers.entities[docVerID]
      if (docVer) {
        return docVer.lang
      }
    }
  }
}

export const selectDocumentVersionID = (state: RootState, mode: PanelMode) => {
  if (mode == "main") {
    return state.ui.mainViewerCurrentDocVerID
  }

  if (mode == "secondary") {
    return state.ui.secondaryViewerCurrentDocVerID
  }
}

export const selectSelectedPageIDs = (state: RootState, mode: PanelMode) => {
  if (mode == "main") {
    return state.ui.mainViewerSelectedIDs
  }

  if (mode == "secondary") {
    return state.ui.secondaryViewerSelectedIDs
  }
}

export const makeSelectSelectedPages = (mode: PanelMode, docVerID?: UUID) =>
  createSelector(
    [
      (state: RootState) => selectAllPages(state, docVerID),
      (state: RootState) => selectSelectedPageIDs(state, mode)
    ],
    (pages, pageIDs) => {
      return pages.filter(p => pageIDs?.includes(p.id))
    }
  )

export const makeSelectPagesHaveChanged = (docVerID?: UUID) =>
  createSelector(
    [
      (state: RootState) => selectInitialPages(state, docVerID),
      (state: RootState) => selectAllPages(state, docVerID)
    ],
    (initialPages: ClientPage[], currentPages: ClientPage[]): boolean => {
      if (initialPages.length !== currentPages.length) return true

      for (let i = 0; i < initialPages.length; i++) {
        const a = initialPages[i]
        const b = currentPages[i]
        if (a.id !== b.id || a.number !== b.number || a.angle !== b.angle) {
          return true
        }
      }

      return false
    }
  )

export const selectDocVerPaginationPageNumber = (
  state: RootState,
  docVerID?: UUID
) => {
  if (!docVerID) return 1
  return state.docVers.entities[docVerID]?.pagination?.page_number ?? 1
}

export const selectDocVerPaginationThumnailPageNumber = (
  state: RootState,
  docVerID?: UUID
) => {
  if (!docVerID) return 1
  return state.docVers.entities[docVerID]?.thumbnailsPagination?.page_number ?? 1
}

export const selectDocVerClientPage = (
  state: RootState,
  {docVerID, pageID}: {docVerID?: string; pageID?: string}
) => {
  if (!docVerID || !pageID) return null
  return (
    state.docVers.entities[docVerID]?.pages.find(p => p.id === pageID) ?? null
  )
}
