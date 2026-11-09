import {apiSlice} from "@/features/api/slice"

export type ExternalService = {
  id: string
  title: string
  url: string
  logo_url: string | null
  slug: string | null
  builtin: boolean
  sort_index: number
  created_at: string
}

export type ServiceCreateIn = {
  title: string
  url: string
  logo_url?: string | null
}

const injected = apiSlice.injectEndpoints({
  endpoints: builder => ({
    getExternalServices: builder.query<ExternalService[], void>({
      query: () => "/services",
      providesTags: [{type: "ExternalService", id: "LIST"}]
    }),
    createExternalService: builder.mutation<ExternalService, ServiceCreateIn>({
      query: body => ({
        url: "/services",
        method: "POST",
        body
      }),
      invalidatesTags: [{type: "ExternalService", id: "LIST"}]
    }),
    deleteExternalService: builder.mutation<void, string>({
      query: id => ({
        url: `/services/${id}`,
        method: "DELETE"
      }),
      invalidatesTags: [{type: "ExternalService", id: "LIST"}]
    })
  })
})

export const {
  useGetExternalServicesQuery,
  useCreateExternalServiceMutation,
  useDeleteExternalServiceMutation
} = injected
