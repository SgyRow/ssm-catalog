import {apiSlice} from "@/features/api/slice"
import client from "@/httpClient"

// --------------------------------------------------------------------------- #
// Types (mirrors papermerge/core/features/msp/schema.py)
// --------------------------------------------------------------------------- #
export type MspTypeSection = {
  id: string
  title: string
  sort_order: number
}

export type MspType = {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
  sections: MspTypeSection[]
}

export type MspSection = {
  id: string
  type_section_id: string | null
  title: string
  body: string | null
  /** Hidden for this measure only: the text is stored but not rendered. */
  hidden: boolean
  sort_order: number
}

export type Msp = {
  id: string
  node_id: string
  title: string
  msp_type_id: string
  msp_type_name: string
  sections: MspSection[]
  created_at: string
  updated_at: string
}

export type NewMspTypeSectionInput = {title: string}

export type NewMspTypeInput = {
  name: string
  description?: string | null
  sections: NewMspTypeSectionInput[]
}

export type MspSectionInput = {
  type_section_id?: string | null
  /**
   * Non-empty title renames the section for this measure only (the type is
   * not changed); empty falls back to the type section title.
   */
  title?: string
  body?: string | null
  /** Hide the section in this measure only (the text is still stored). */
  hidden?: boolean
}

export type NewMspInput = {
  parent_id: string
  title: string
  msp_type_id: string
  sections: MspSectionInput[]
}

export type UpdateMspInput = {
  title?: string | null
  sections?: MspSectionInput[] | null
}

const injected = apiSlice.injectEndpoints({
  endpoints: builder => ({
    // Types (виды мер)
    listMspTypes: builder.query<MspType[], void>({
      query: () => "/msp/types",
      providesTags: [{type: "MspType", id: "LIST"}]
    }),
    getMspType: builder.query<MspType, string>({
      query: id => `/msp/types/${id}`,
      providesTags: (_r, _e, id) => [{type: "MspType", id}]
    }),
    createMspType: builder.mutation<MspType, NewMspTypeInput>({
      query: body => ({
        url: "/msp/types",
        method: "POST",
        body
      }),
      invalidatesTags: [{type: "MspType", id: "LIST"}]
    }),
    addMspTypeSection: builder.mutation<
      MspTypeSection,
      {msp_type_id: string; title: string}
    >({
      query: ({msp_type_id, title}) => ({
        url: `/msp/types/${msp_type_id}/sections`,
        method: "POST",
        body: {title}
      }),
      invalidatesTags: [{type: "MspType", id: "LIST"}]
    }),
    updateMspType: builder.mutation<
      MspType,
      {
        msp_type_id: string
        name?: string | null
        description?: string | null
        sections?: Array<{id?: string | null; title: string}>
      }
    >({
      query: ({msp_type_id, ...body}) => ({
        url: `/msp/types/${msp_type_id}`,
        method: "PATCH",
        body
      }),
      invalidatesTags: (_r, _e, {msp_type_id}) => [
        {type: "MspType", id: "LIST"},
        {type: "MspType", id: msp_type_id},
        "Msp"
      ]
    }),
    deleteMspType: builder.mutation<void, string>({
      query: id => ({
        url: `/msp/types/${id}`,
        method: "DELETE"
      }),
      invalidatesTags: [{type: "MspType", id: "LIST"}]
    }),

    // Measures (меры)
    createMsp: builder.mutation<Msp, NewMspInput>({
      query: body => ({
        url: "/msp/",
        method: "POST",
        body
      }),
      invalidatesTags: ["Node", "Folder", {type: "Msp", id: "LIST"}]
    }),
    getMsp: builder.query<Msp, string>({
      query: id => `/msp/${id}`,
      providesTags: (_r, _e, id) => [{type: "Msp", id}]
    }),
    getMspByNode: builder.query<Msp | null, string>({
      query: nodeId => `/msp/by-node/${nodeId}`,
      providesTags: (_r, _e, nodeId) => [{type: "Msp", id: nodeId}]
    }),
    updateMsp: builder.mutation<Msp, {msp_id: string} & UpdateMspInput>({
      query: ({msp_id, ...patch}) => ({
        url: `/msp/${msp_id}`,
        method: "PUT",
        body: patch
      }),
      invalidatesTags: (result, _e, {msp_id}) => [
        "Node",
        {type: "Msp", id: msp_id},
        ...(result ? [{type: "Msp" as const, id: result.node_id}] : [])
      ]
    }),
    deleteMsp: builder.mutation<void, string>({
      query: mspId => ({
        url: `/msp/${mspId}`,
        method: "DELETE"
      }),
      invalidatesTags: ["Node", "Folder", {type: "Msp", id: "LIST"}]
    })
  })
})

export const {
  useListMspTypesQuery,
  useGetMspTypeQuery,
  useCreateMspTypeMutation,
  useAddMspTypeSectionMutation,
  useUpdateMspTypeMutation,
  useDeleteMspTypeMutation,
  useCreateMspMutation,
  useGetMspQuery,
  useGetMspByNodeQuery,
  useUpdateMspMutation,
  useDeleteMspMutation
} = injected

// --------------------------------------------------------------------------- #
// PDF download (on demand, from the stored sections)
// --------------------------------------------------------------------------- #
/** Sanitize a measure title into a safe `.pdf` file name. */
export function mspPdfFileName(title: string): string {
  const base = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, "_")
    .slice(0, 120)
    .trim()
  return `${base || "msp"}.pdf`
}

function parseContentDispositionFilename(
  header: string | undefined,
  fallback: string
): string {
  if (!header) {
    return fallback
  }
  // Prefer the RFC 5987 form: filename*=UTF-8''<percent-encoded>
  const star = header.match(/filename\*\s*=\s*[^']*''([^;]+)/i)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim())
    } catch {
      /* fall through */
    }
  }
  const plain = header.match(/filename\s*=\s*"?([^";]+)"?/i)
  if (plain?.[1]) {
    return plain[1].trim()
  }
  return fallback
}

/**
 * Download the measure PDF. Uses the shared axios client so the auth token
 * is attached automatically (the endpoint is protected like other /api calls).
 */
export async function downloadMspPdf(mspId: string, title: string) {
  const fallbackName = mspPdfFileName(title)
  const resp = await client.get(`/api/msp/${mspId}/pdf`, {
    responseType: "blob"
  })
  const blob = new Blob([resp.data], {type: "application/pdf"})
  const filename = parseContentDispositionFilename(
    resp.headers?.["content-disposition"],
    fallbackName
  )
  const blobUrl = window.URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = blobUrl
  anchor.setAttribute("download", filename)
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.URL.revokeObjectURL(blobUrl)
}
