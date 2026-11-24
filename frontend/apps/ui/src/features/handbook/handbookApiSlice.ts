import {apiSlice} from "@/features/api/slice"
import {getBaseURL} from "@/utils"
import Cookies from "js-cookie"

export type HandbookFile = {
  filename: string
  content_type: string
  size_bytes: number
  url: string
}

export type HandbookFolder = {
  id: string
  title: string
  sort_order: number
  created_at: string
  updated_at: string
}

export type HandbookArticle = {
  id: string
  title: string
  body: string
  author_id: string | null
  author_username: string
  created_at: string
  updated_at: string
  kind: "article" | "file"
  file: HandbookFile | null
  folder_id: string | null
}

export type HandbookAsset = {
  id: string
  article_id: string
  filename: string
  content_type: string
  size_bytes: number
  url: string
}

const injected = apiSlice.injectEndpoints({
  endpoints: builder => ({
    getHandbookArticles: builder.query<HandbookArticle[], void>({
      query: () => "/handbook",
      providesTags: [{type: "Handbook", id: "LIST"}]
    }),
    getHandbookFolders: builder.query<HandbookFolder[], void>({
      query: () => "/handbook/folders",
      providesTags: [{type: "Handbook", id: "FOLDERS"}]
    }),
    createHandbookFolder: builder.mutation<HandbookFolder, {title: string}>({
      query: body => ({
        url: "/handbook/folders",
        method: "POST",
        body
      }),
      invalidatesTags: [{type: "Handbook", id: "FOLDERS"}]
    }),
    updateHandbookFolder: builder.mutation<
      HandbookFolder,
      {id: string; title: string}
    >({
      query: ({id, ...body}) => ({
        url: `/handbook/folders/${id}`,
        method: "PATCH",
        body
      }),
      invalidatesTags: [{type: "Handbook", id: "FOLDERS"}]
    }),
    deleteHandbookFolder: builder.mutation<void, string>({
      query: id => ({
        url: `/handbook/folders/${id}`,
        method: "DELETE"
      }),
      invalidatesTags: [
        {type: "Handbook", id: "FOLDERS"},
        {type: "Handbook", id: "LIST"}
      ]
    }),
    getHandbookArticle: builder.query<HandbookArticle, string>({
      query: id => `/handbook/${id}`,
      providesTags: (_r, _e, id) => [{type: "Handbook", id}]
    }),
    createHandbookArticle: builder.mutation<
      HandbookArticle,
      {title: string; body?: string; folder_id?: string | null}
    >({
      query: body => ({
        url: "/handbook",
        method: "POST",
        body
      }),
      invalidatesTags: [{type: "Handbook", id: "LIST"}]
    }),
    updateHandbookArticle: builder.mutation<
      HandbookArticle,
      {id: string; title?: string; body?: string; folder_id?: string | null}
    >({
      query: ({id, ...body}) => ({
        url: `/handbook/${id}`,
        method: "PATCH",
        body
      }),
      invalidatesTags: (_r, _e, {id}) => [
        {type: "Handbook", id},
        {type: "Handbook", id: "LIST"}
      ]
    }),
    deleteHandbookArticle: builder.mutation<void, string>({
      query: id => ({
        url: `/handbook/${id}`,
        method: "DELETE"
      }),
      invalidatesTags: [{type: "Handbook", id: "LIST"}]
    }),
    createHandbookDocument: builder.mutation<
      HandbookArticle,
      {file: File; folder_id?: string | null}
    >({
      queryFn: async ({file, folder_id}) => {
        const token = Cookies.get("access_token")
        const form = new FormData()
        form.append("file", file)
        if (folder_id) {
          form.append("folder_id", folder_id)
        }
        const headers: Record<string, string> = {}
        if (token) {
          headers.Authorization = `Bearer ${token}`
        }
        const res = await fetch(`${getBaseURL()}/api/handbook/documents`, {
          method: "POST",
          headers,
          body: form
        })
        if (!res.ok) {
          return {
            error: {status: res.status, statusText: res.statusText, data: null}
          }
        }
        const data = (await res.json()) as HandbookArticle
        return {data}
      },
      invalidatesTags: [{type: "Handbook", id: "LIST"}]
    }),
    replaceHandbookDocument: builder.mutation<
      HandbookArticle,
      {id: string; file: File}
    >({
      queryFn: async ({id, file}) => {
        const token = Cookies.get("access_token")
        const form = new FormData()
        form.append("file", file)
        const headers: Record<string, string> = {}
        if (token) {
          headers.Authorization = `Bearer ${token}`
        }
        const res = await fetch(
          `${getBaseURL()}/api/handbook/documents/${id}/replace`,
          {method: "POST", headers, body: form}
        )
        if (!res.ok) {
          return {
            error: {status: res.status, statusText: res.statusText, data: null}
          }
        }
        const data = (await res.json()) as HandbookArticle
        return {data}
      },
      async onQueryStarted({id}, {dispatch, queryFulfilled}) {
        try {
          const {data} = await queryFulfilled
          dispatch(
            injected.util.updateQueryData("getHandbookArticle", id, () => data)
          )
        } catch {
          /* keep previous cache; invalidatesTags will refetch */
        }
      },
      invalidatesTags: (_r, _e, {id}) => [
        {type: "Handbook", id},
        {type: "Handbook", id: "LIST"}
      ]
    })
  })
})

export const {
  useGetHandbookArticlesQuery,
  useGetHandbookFoldersQuery,
  useCreateHandbookFolderMutation,
  useUpdateHandbookFolderMutation,
  useDeleteHandbookFolderMutation,
  useGetHandbookArticleQuery,
  useCreateHandbookArticleMutation,
  useUpdateHandbookArticleMutation,
  useDeleteHandbookArticleMutation,
  useCreateHandbookDocumentMutation,
  useReplaceHandbookDocumentMutation
} = injected

export async function uploadHandbookAsset(
  articleId: string,
  file: File
): Promise<HandbookAsset> {
  const token = Cookies.get("access_token")
  const form = new FormData()
  form.append("file", file)
  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(
    `${getBaseURL()}/api/handbook/${articleId}/assets`,
    {method: "POST", headers, body: form}
  )
  if (!res.ok) {
    throw new Error("upload_failed")
  }
  return (await res.json()) as HandbookAsset
}
