import {apiSlice} from "@/features/api/slice"
import {getBaseURL} from "@/utils"
import Cookies from "js-cookie"

export type HandbookArticle = {
  id: string
  title: string
  body: string
  author_id: string | null
  author_username: string
  created_at: string
  updated_at: string
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
    getHandbookArticle: builder.query<HandbookArticle, string>({
      query: id => `/handbook/${id}`,
      providesTags: (_r, _e, id) => [{type: "Handbook", id}]
    }),
    createHandbookArticle: builder.mutation<
      HandbookArticle,
      {title: string; body?: string}
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
      {id: string; title?: string; body?: string}
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
    })
  })
})

export const {
  useGetHandbookArticlesQuery,
  useGetHandbookArticleQuery,
  useCreateHandbookArticleMutation,
  useUpdateHandbookArticleMutation,
  useDeleteHandbookArticleMutation
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
