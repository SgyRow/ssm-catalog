import {PAGINATION_DEFAULT_ITEMS_PER_PAGES} from "@/cconstants"
import {apiSlice} from "@/features/api/slice"
import type {
  SearchEntityTypeFilter,
  SearchSortOption
} from "@/features/search/types"
import {NodeType, Paginated, SearchResultNode} from "@/types"

type SearchQueryArgs = {
  qs: string
  page_number?: number
  page_size?: number
  entity_type?: SearchEntityTypeFilter
  sort?: SearchSortOption
}

function buildSearchQueryString({
  qs,
  page_number = 1,
  page_size = PAGINATION_DEFAULT_ITEMS_PER_PAGES,
  entity_type,
  sort
}: SearchQueryArgs): string {
  const params = new URLSearchParams({
    q: qs,
    page_number: String(page_number),
    page_size: String(page_size)
  })

  if (entity_type && entity_type !== "all") {
    params.set("entity_type", entity_type)
  }
  if (sort && sort !== "relevance") {
    params.set("sort", sort)
  }

  return `/search/?${params.toString()}`
}

export const apiSliceWithSearch = apiSlice.injectEndpoints({
  endpoints: builder => ({
    getPaginatedSearchResults: builder.query<
      Paginated<SearchResultNode>,
      SearchQueryArgs
    >({
      query: (args: SearchQueryArgs) => buildSearchQueryString(args),
      keepUnusedDataFor: 1
    }),
    /*  Index does not store nodes' breadcrumb, tag color info.
     We need perform one extra query to get node's breadcrumb and tag color info.
    */
    getNodes: builder.query<NodeType[], string[]>({
      query: node_ids =>
        `/nodes/?${node_ids.map(i => `node_ids=${i}`).join("&")}`,
      keepUnusedDataFor: 1
    })
  })
})

export const {useGetPaginatedSearchResultsQuery, useGetNodesQuery} =
  apiSliceWithSearch
