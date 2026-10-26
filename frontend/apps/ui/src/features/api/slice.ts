import {getBaseURL} from "@/utils"
import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/query/react"

import type {RootState} from "@/app/types"

const getKeepUnusedDataFor = function () {
  const keep_unused_data_for = import.meta.env.VITE_KEEP_UNUSED_DATA_FOR

  if (keep_unused_data_for == 0) {
    return 0
  }
  return keep_unused_data_for || 60
}

const baseQuery = fetchBaseQuery({
  baseUrl: `${getBaseURL()}/api`,
  prepareHeaders: (headers, {getState}) => {
    const state = getState() as RootState
    const token = state.auth.token

    if (token) {
      headers.set("authorization", `Bearer ${token}`)
    }

    headers.set("Content-Type", "application/json")

    return headers
  }
})

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: baseQuery,
  keepUnusedDataFor: getKeepUnusedDataFor(),
  tagTypes: [
    "Role",
    "Group",
    "GroupHome",
    "GroupInbox",
    "User",
    "Tag",
    "Node",
    "PortalRoot",
    "PortalNodes",
    "PortalFeed",
    "NodeTag", // tags fetched per node
    "Folder",
    "Document",
    "DocVersList",
    "DocumentVersion",
    "LibraryFavorites",
    "LibraryRecent",
    "LibraryTrash",
    "LibraryNote",
    "LibraryComments",
    "LibraryRating",
    "LibraryNotifications",
    "AuditLog",
    "LibrarySettings",
    "DocumentFullVersions",
    "CitizenCategory",
    "CitizenCategoryFolders",
    "FolderCitizenCategories"
  ],
  endpoints: _ => ({})
})
