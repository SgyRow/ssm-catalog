import {apiSlice} from "@/features/api/slice"

export type MaterialKind =
  | "normative"
  | "reference"
  | "measure"
  | "methodical"
  | "form"

export type AdvancedSearchItem = {
  id: string
  title: string
  ctype: "folder" | "document"
  created_at: string
  updated_at: string
  tags: string[]
}

export type AdvancedSearchResponse = {
  page_size: number
  page_number: number
  num_pages: number
  items: AdvancedSearchItem[]
}

export type AdvancedSearchArgs = {
  title?: string
  entity_type?: "folder" | "document"
  created_from?: string
  created_to?: string
  updated_from?: string
  updated_to?: string
  tag_ids?: string[]
  category_ids?: string[]
  kinds?: MaterialKind[]
  page_number?: number
  page_size?: number
}

function buildQuery(args: AdvancedSearchArgs): string {
  const params = new URLSearchParams()
  if (args.title?.trim()) params.set("title", args.title.trim())
  if (args.entity_type) params.set("entity_type", args.entity_type)
  if (args.created_from) params.set("created_from", args.created_from)
  if (args.created_to) params.set("created_to", args.created_to)
  if (args.updated_from) params.set("updated_from", args.updated_from)
  if (args.updated_to) params.set("updated_to", args.updated_to)
  for (const id of args.tag_ids ?? []) params.append("tag_ids", id)
  for (const id of args.category_ids ?? []) params.append("category_ids", id)
  for (const kind of args.kinds ?? []) params.append("kinds", kind)
  params.set("page_number", String(args.page_number ?? 1))
  params.set("page_size", String(args.page_size ?? 20))
  return `/advanced-search/?${params.toString()}`
}

const injected = apiSlice.injectEndpoints({
  endpoints: builder => ({
    advancedSearch: builder.query<AdvancedSearchResponse, AdvancedSearchArgs>({
      query: args => buildQuery(args)
    })
  })
})

export const {useLazyAdvancedSearchQuery} = injected
