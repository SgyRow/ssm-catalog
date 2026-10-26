import {apiSlice} from "@/features/api/slice"
import authSliceReducer from "@/features/auth/slice"
import {docsListenerMiddleware} from "@/features/document/middleware"
import docsReducer from "@/features/document/store/docsSlice"
import documentDownloadsReducer from "@/features/document/store/documentDownloadsSlice"
import docVersReducer from "@/features/document/store/documentVersSlice"
import imageObjects from "@/features/document/store/imageObjectsSlice"
import pagesReducer from "@/features/document/store/pagesSlice"
import filesReducer from "@/features/files/filesSlice"
import groupsReducer from "@/features/groups/groupsSlice"
import nodesReducer from "@/features/nodes/nodesSlice"
import thumbnailObjects from "@/features/nodes/thumbnailObjectsSlice"
import rolesReducer from "@/features/roles/rolesSlice"
import searchReducer from "@/features/search/searchSlice"
import tagsReducer from "@/features/tags/tagsSlice"
import uiReducer from "@/features/ui/uiSlice"
import usersReducer from "@/features/users/usersSlice"
import currentUserReducer from "@/slices/currentUser"
import {configureStore} from "@reduxjs/toolkit"
import {listenerMiddleware} from "./listenerMiddleware"
import "@/features/library/libraryApiSlice"
import "@/features/portal/portalApiSlice"

export const store = configureStore({
  reducer: {
    auth: authSliceReducer,
    currentUser: currentUserReducer,
    tags: tagsReducer,
    groups: groupsReducer,
    roles: rolesReducer,
    users: usersReducer,
    nodes: nodesReducer,
    search: searchReducer,
    pages: pagesReducer,
    imageObjects: imageObjects,
    thumbnailObjects: thumbnailObjects,
    documentDownloads: documentDownloadsReducer,
    ui: uiReducer,
    docVers: docVersReducer,
    docs: docsReducer,
    files: filesReducer,
    [apiSlice.reducerPath]: apiSlice.reducer
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware()
      .prepend(listenerMiddleware.middleware)
      .prepend(docsListenerMiddleware.middleware)
      .concat(apiSlice.middleware)
})
