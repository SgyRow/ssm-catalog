import {apiSlice} from "@/features/api/slice"

export type CitizenCategory = {
  id: string
  name: string
  description: string | null
  sort_order: number
  folder_count: number
  created_at: string
  updated_at: string
}

export type CitizenCategoryFolder = {
  node_id: string
  title: string
  updated_at: string
}

const injected = apiSlice.injectEndpoints({
  endpoints: builder => ({
    getCitizenCategories: builder.query<CitizenCategory[], void>({
      query: () => "/citizen-categories",
      providesTags: [{type: "CitizenCategory", id: "LIST"}]
    }),
    createCitizenCategory: builder.mutation<
      CitizenCategory,
      {name: string; description?: string; sort_order?: number}
    >({
      query: body => ({
        url: "/citizen-categories",
        method: "POST",
        body
      }),
      invalidatesTags: [{type: "CitizenCategory", id: "LIST"}]
    }),
    updateCitizenCategory: builder.mutation<
      CitizenCategory,
      {id: string; name?: string; description?: string | null; sort_order?: number}
    >({
      query: ({id, ...body}) => ({
        url: `/citizen-categories/${id}`,
        method: "PATCH",
        body
      }),
      invalidatesTags: [{type: "CitizenCategory", id: "LIST"}]
    }),
    deleteCitizenCategory: builder.mutation<void, string>({
      query: id => ({
        url: `/citizen-categories/${id}`,
        method: "DELETE"
      }),
      invalidatesTags: [{type: "CitizenCategory", id: "LIST"}]
    }),
    getCitizenCategoryFolders: builder.query<
      CitizenCategoryFolder[],
      string
    >({
      query: categoryId => `/citizen-categories/${categoryId}/folders`,
      providesTags: (_res, _err, categoryId) => [
        {type: "CitizenCategoryFolders", id: categoryId}
      ]
    }),
    getFolderCitizenCategories: builder.query<CitizenCategory[], string>({
      query: nodeId => `/citizen-categories/folders/${nodeId}`,
      providesTags: (_res, _err, nodeId) => [
        {type: "FolderCitizenCategories", id: nodeId}
      ]
    }),
    setFolderCitizenCategories: builder.mutation<
      CitizenCategory[],
      {nodeId: string; categoryIds: string[]}
    >({
      query: ({nodeId, categoryIds}) => ({
        url: `/citizen-categories/folders/${nodeId}`,
        method: "PUT",
        body: {category_ids: categoryIds}
      }),
      invalidatesTags: (_res, _err, {nodeId}) => [
        {type: "FolderCitizenCategories", id: nodeId},
        {type: "CitizenCategory", id: "LIST"},
        {type: "CitizenCategoryFolders", id: "LIST"}
      ]
    })
  })
})

export const {
  useGetCitizenCategoriesQuery,
  useCreateCitizenCategoryMutation,
  useUpdateCitizenCategoryMutation,
  useDeleteCitizenCategoryMutation,
  useGetCitizenCategoryFoldersQuery,
  useGetFolderCitizenCategoriesQuery,
  useSetFolderCitizenCategoriesMutation
} = injected
