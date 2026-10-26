import {apiSlice} from "@/features/api/slice"
import {portalNodesInvalidationTags} from "@/features/portal/portalApiSlice"
import type {FolderType, NodeType, Paginated} from "@/types"

export type AuditLogEntry = {
  id: string
  user_id: string | null
  action: string
  resource_type: string
  resource_id: string | null
  detail: string | null
  created_at: string
}

export type FavoriteRow = {
  node_id: string
  title: string
  ctype: string
  created_at: string
  in_trash: boolean
}

export type RecentRow = {
  node_id: string
  title: string
  ctype: string
  viewed_at: string
  in_trash: boolean
}

export type LibraryNote = {
  id: string
  document_id: string
  body: string
  created_at: string
  updated_at: string
}

export type LibraryComment = {
  id: string
  document_id: string
  user_id: string
  author: string
  body: string
  created_at: string
}

export type LibraryRating = {
  user_id: string
  document_id: string
  score: number
  avg_score: number | null
  vote_count: number | null
}

export type LibraryNotification = {
  id: string
  kind: string
  payload: string | null
  read_at: string | null
  created_at: string
}

type TrashBatch = {node_ids: string[]}

export type LibrarySettings = {
  trash_retention_days: number
}

export type DocumentFullVersionAttachment = {
  node_id: string
  title: string
  ctype: string
}

export const apiSliceWithLibrary = apiSlice.injectEndpoints({
  endpoints: builder => ({
    getLibraryFavorites: builder.query<FavoriteRow[], void>({
      query: () => "/library/favorites/",
      providesTags: [{type: "LibraryFavorites", id: "LIST"}]
    }),
    addLibraryFavorite: builder.mutation<void, string>({
      query: nodeId => ({
        url: `/library/favorites/${nodeId}/`,
        method: "POST"
      }),
      invalidatesTags: [{type: "LibraryFavorites", id: "LIST"}]
    }),
    removeLibraryFavorite: builder.mutation<void, string>({
      query: nodeId => ({
        url: `/library/favorites/${nodeId}/`,
        method: "DELETE"
      }),
      invalidatesTags: [{type: "LibraryFavorites", id: "LIST"}]
    }),
    getLibraryRecent: builder.query<RecentRow[], void>({
      query: () => "/library/recent/",
      providesTags: [{type: "LibraryRecent", id: "LIST"}]
    }),
    getLibraryTrash: builder.query<
      Paginated<NodeType>,
      {page_number?: number; page_size?: number}
    >({
      query: ({page_number = 1, page_size = 50}) =>
        `/library/trash/?page_number=${page_number}&page_size=${page_size}`,
      providesTags: [{type: "LibraryTrash", id: "LIST"}]
    }),
    restoreLibraryTrash: builder.mutation<void, TrashBatch>({
      query: body => ({
        url: "/library/trash/restore/",
        method: "POST",
        body
      }),
      invalidatesTags: [
        {type: "LibraryTrash", id: "LIST"},
        {type: "LibraryFavorites", id: "LIST"},
        {type: "LibraryRecent", id: "LIST"},
        "Node",
        "Folder"
      ]
    }),
    purgeLibraryTrash: builder.mutation<void, TrashBatch>({
      query: body => ({
        url: "/library/trash/purge/",
        method: "POST",
        body
      }),
      invalidatesTags: [
        {type: "LibraryTrash", id: "LIST"},
        {type: "LibraryRecent", id: "LIST"},
        "Node",
        "Folder"
      ]
    }),
    getLibraryNote: builder.query<LibraryNote | null, string>({
      query: documentId => `/library/documents/${documentId}/note`,
      providesTags: (_r, _e, documentId) => [
        {type: "LibraryNote", id: documentId}
      ]
    }),
    putLibraryNote: builder.mutation<
      LibraryNote,
      {documentId: string; body: string}
    >({
      query: ({documentId, body}) => ({
        url: `/library/documents/${documentId}/note`,
        method: "PUT",
        body: {body}
      }),
      invalidatesTags: (_r, _e, {documentId}) => [
        {type: "LibraryNote", id: documentId}
      ]
    }),
    getLibraryComments: builder.query<LibraryComment[], string>({
      query: documentId => `/library/documents/${documentId}/comments`,
      providesTags: (_r, _e, documentId) => [
        {type: "LibraryComments", id: documentId}
      ]
    }),
    postLibraryComment: builder.mutation<
      LibraryComment,
      {documentId: string; body: string}
    >({
      query: ({documentId, body}) => ({
        url: `/library/documents/${documentId}/comments`,
        method: "POST",
        body: {body}
      }),
      invalidatesTags: (_r, _e, {documentId}) => [
        {type: "LibraryComments", id: documentId}
      ]
    }),
    putLibraryComment: builder.mutation<
      LibraryComment,
      {documentId: string; commentId: string; body: string}
    >({
      query: ({documentId, commentId, body}) => ({
        url: `/library/documents/${documentId}/comments/${commentId}`,
        method: "PUT",
        body: {body}
      }),
      invalidatesTags: (_r, _e, {documentId}) => [
        {type: "LibraryComments", id: documentId}
      ]
    }),
    deleteLibraryComment: builder.mutation<
      void,
      {documentId: string; commentId: string}
    >({
      query: ({documentId, commentId}) => ({
        url: `/library/documents/${documentId}/comments/${commentId}`,
        method: "DELETE"
      }),
      invalidatesTags: (_r, _e, {documentId}) => [
        {type: "LibraryComments", id: documentId}
      ]
    }),
    getLibraryRating: builder.query<LibraryRating, string>({
      query: documentId => `/library/documents/${documentId}/rating`,
      providesTags: (_r, _e, documentId) => [
        {type: "LibraryRating", id: documentId}
      ]
    }),
    putLibraryRating: builder.mutation<
      LibraryRating,
      {documentId: string; score: number}
    >({
      query: ({documentId, score}) => ({
        url: `/library/documents/${documentId}/rating`,
        method: "PUT",
        body: {score}
      }),
      invalidatesTags: (_r, _e, {documentId}) => [
        {type: "LibraryRating", id: documentId}
      ]
    }),
    getLibraryNotifications: builder.query<
      LibraryNotification[],
      number | void
    >({
      query: (limit = 50) => `/library/notifications/?limit=${limit}`,
      providesTags: [{type: "LibraryNotifications", id: "LIST"}]
    }),
    markLibraryNotificationRead: builder.mutation<void, string>({
      query: id => ({
        url: `/library/notifications/${id}/read`,
        method: "POST"
      }),
      invalidatesTags: [{type: "LibraryNotifications", id: "LIST"}]
    }),
    getLibraryAuditLog: builder.query<
      Paginated<AuditLogEntry>,
      {page?: number; page_size?: number}
    >({
      query: ({page = 1, page_size = 50}) =>
        `/library/audit/?page=${page}&page_size=${page_size}`,
      providesTags: [{type: "AuditLog", id: "LIST"}]
    }),
    createMspTemplate: builder.mutation<
      {root: FolderType; folder_count: number},
      {parent_id: string; title: string}
    >({
      query: body => ({
        url: "/library/msp-template/",
        method: "POST",
        body
      }),
      invalidatesTags: (_result, _error, body) => [
        "Node",
        ...portalNodesInvalidationTags(body.parent_id)
      ]
    }),
    getLibrarySettings: builder.query<LibrarySettings, void>({
      query: () => "/library/settings/",
      providesTags: [{type: "LibrarySettings", id: "CONFIG"}]
    }),
    updateLibrarySettings: builder.mutation<LibrarySettings, LibrarySettings>({
      query: body => ({
        url: "/library/settings/",
        method: "PATCH",
        body
      }),
      invalidatesTags: [{type: "LibrarySettings", id: "CONFIG"}]
    }),
    getDocumentFullVersions: builder.query<
      DocumentFullVersionAttachment[],
      string
    >({
      query: documentId => `/library/documents/${documentId}/full-versions`,
      providesTags: (_r, _e, documentId) => [
        {type: "DocumentFullVersions", id: documentId}
      ]
    }),
    putDocumentFullVersions: builder.mutation<
      DocumentFullVersionAttachment[],
      {documentId: string; nodeIds: string[]}
    >({
      query: ({documentId, nodeIds}) => ({
        url: `/library/documents/${documentId}/full-versions`,
        method: "PUT",
        body: {node_ids: nodeIds}
      }),
      invalidatesTags: (_r, _e, {documentId}) => [
        {type: "DocumentFullVersions", id: documentId}
      ]
    })
  })
})

export const {
  useGetLibraryFavoritesQuery,
  useAddLibraryFavoriteMutation,
  useRemoveLibraryFavoriteMutation,
  useGetLibraryRecentQuery,
  useGetLibraryTrashQuery,
  useRestoreLibraryTrashMutation,
  usePurgeLibraryTrashMutation,
  useGetLibraryNoteQuery,
  usePutLibraryNoteMutation,
  useGetLibraryCommentsQuery,
  usePostLibraryCommentMutation,
  usePutLibraryCommentMutation,
  useDeleteLibraryCommentMutation,
  useGetLibraryRatingQuery,
  usePutLibraryRatingMutation,
  useGetLibraryNotificationsQuery,
  useMarkLibraryNotificationReadMutation,
  useGetLibraryAuditLogQuery,
  useCreateMspTemplateMutation,
  useGetLibrarySettingsQuery,
  useUpdateLibrarySettingsMutation,
  useGetDocumentFullVersionsQuery,
  usePutDocumentFullVersionsMutation
} = apiSliceWithLibrary
