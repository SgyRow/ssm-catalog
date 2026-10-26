import {apiSlice} from "@/features/api/slice"
import type {NodeType, Paginated} from "@/types"

export type PortalRoot = {
  id: string
  title: string
}

export type PortalNewsAttachment = {
  node_id: string
  title: string
  ctype: string
}

export type PortalNewsItem = {
  id: string
  title: string
  body: string
  created_at: string
  updated_at: string
  author_id: string | null
  author_username: string
  attachments: PortalNewsAttachment[]
}

export type PortalNodesArgs = {
  parentId: string
  page_number?: number
  page_size?: number
  filter?: string
}

/** RTK Query tags to refresh portal folder listings after node changes. */
export function portalNodesInvalidationTags(parentId?: string) {
  const tags: Array<{type: "PortalNodes"; id: string}> = [
    {type: "PortalNodes", id: "LIST"}
  ]
  if (parentId) {
    tags.push({type: "PortalNodes", id: parentId})
  }
  return tags
}

const injected = apiSlice.injectEndpoints({
  endpoints: builder => ({
    getPortalRoot: builder.query<PortalRoot, void>({
      query: () => "/portal/root",
      providesTags: [{type: "PortalRoot", id: "ROOT"}]
    }),
    getPortalNodes: builder.query<Paginated<NodeType>, PortalNodesArgs>({
      query: ({
        parentId,
        page_number = 1,
        page_size = 50,
        filter
      }) => {
        const sp = new URLSearchParams({
          page_number: String(page_number),
          page_size: String(page_size)
        })
        if (filter) {
          sp.set("filter", filter)
        }
        return `/portal/nodes/${parentId}?${sp.toString()}`
      },
      providesTags: (_res, _err, arg) => [
        {type: "PortalNodes", id: "LIST"},
        {type: "PortalNodes", id: arg.parentId}
      ]
    }),
    getPortalFeed: builder.query<
      Paginated<PortalNewsItem>,
      {page?: number; page_size?: number}
    >({
      query: ({page = 1, page_size = 50} = {}) =>
        `/portal/feed?page=${page}&page_size=${page_size}`,
      providesTags: [{type: "PortalFeed", id: "LIST"}]
    }),
    createPortalNews: builder.mutation<
      PortalNewsItem,
      {title: string; body: string; attachment_node_ids: string[]}
    >({
      query: body => ({
        url: "/portal/feed",
        method: "POST",
        body
      }),
      invalidatesTags: [{type: "PortalFeed", id: "LIST"}]
    }),
    updatePortalNews: builder.mutation<
      PortalNewsItem,
      {id: string; title?: string; body?: string; attachment_node_ids?: string[]}
    >({
      query: ({id, ...patch}) => ({
        url: `/portal/feed/${id}`,
        method: "PATCH",
        body: patch
      }),
      invalidatesTags: [{type: "PortalFeed", id: "LIST"}]
    }),
    deletePortalNews: builder.mutation<void, string>({
      query: id => ({
        url: `/portal/feed/${id}`,
        method: "DELETE"
      }),
      invalidatesTags: [{type: "PortalFeed", id: "LIST"}]
    })
  })
})

export const {
  useGetPortalRootQuery,
  useGetPortalNodesQuery,
  useLazyGetPortalNodesQuery,
  useGetPortalFeedQuery,
  useCreatePortalNewsMutation,
  useUpdatePortalNewsMutation,
  useDeletePortalNewsMutation
} = injected
