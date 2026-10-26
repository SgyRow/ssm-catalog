import {apiSlice} from "@/features/api/slice"
import type {
  ExtractPagesResponse,
  MovePagesReturnType,
  ServerNotifDocumentMoved,
  ServerNotifPayload,
  ServerNotifType
} from "@/types"
import {ExtractStrategyType, MovePagesType} from "@/types"
import {getWSURL} from "@/utils"

import type {DocVersList, PagesType} from "@/features/document/types"
import {DocumentType, DocumentVersion} from "@/features/document/types"
import {documentMovedNotifReceived} from "./documentVersSlice"

type ApplyPagesType = {
  documentID: string
  pages: PagesType[]
}

type ExtractPagesType = {
  body: {
    source_page_ids: string[]
    target_folder_id: string
    strategy: ExtractStrategyType
    title_format: string
  }
  sourceDocID: string
  sourceDocParentID: string
}

export const apiSliceWithDocuments = apiSlice.injectEndpoints({
  endpoints: builder => ({
    getDocLastVersion: builder.query<DocumentVersion, string>({
      query: nodeID => `/documents/${nodeID}/last-version/`,
      providesTags: (_result, _error, arg) => [
        {type: "DocumentVersion", id: arg}
      ]
    }),
    getDocVersionsList: builder.query<DocVersList, string>({
      query: nodeID => `/documents/${nodeID}/versions`,
      providesTags: (_result, _error, arg) => [{type: "DocVersList", id: arg}]
    }),
    getDocument: builder.query<DocumentType, string>({
      query: nodeID => `/documents/${nodeID}`,
      providesTags: (_result, _error, arg) => [{type: "Document", id: arg}],
      async onCacheEntryAdded(_arg, lifecycleApi) {
        const url = getWSURL()

        if (!url) {
          return
        }

        const ws = new WebSocket(url)
        try {
          await lifecycleApi.cacheDataLoaded

          const listener = (event: MessageEvent<string>) => {
            const message: {
              type: ServerNotifType
              payload: ServerNotifPayload
            } = JSON.parse(event.data)
            console.log(`${message.type} received`)
            console.log(message.payload)
            switch (message.type) {
              case "document_moved": {
                const payload = message.payload as ServerNotifDocumentMoved
                console.log(`Invalidating Document ${payload.document_id}`)
                lifecycleApi.dispatch(
                  apiSlice.util.invalidateTags([
                    {
                      type: "Document",
                      id: payload.document_id
                    },
                    {
                      type: "Node",
                      id: payload.source_folder_id
                    },
                    {
                      type: "Node",
                      id: payload.target_folder_id
                    }
                  ])
                )
                lifecycleApi.dispatch(documentMovedNotifReceived(payload))
                break
              }
              default:
                break
            }
          }
          ws.addEventListener("message", listener)
        } catch {
          // no-op
        }
        await lifecycleApi.cacheEntryRemoved
        ws.close()
      }
    }),
    applyPageOpChanges: builder.mutation<DocumentType, ApplyPagesType>({
      query: data => ({
        url: "/pages/",
        method: "POST",
        body: data.pages
      }),
      invalidatesTags: (_result, _error, arg) => [
        {type: "Document", id: arg.documentID}
      ]
    }),
    movePages: builder.mutation<MovePagesReturnType, MovePagesType>({
      query: data => ({
        url: "/pages/move",
        method: "POST",
        body: data.body
      }),
      invalidatesTags: (_result, _error, arg) => [
        {type: "Document", id: arg.targetDocID},
        {type: "Document", id: arg.sourceDocID},
        {type: "Node", id: arg.sourceDocParentID}
      ]
    }),
    extractPages: builder.mutation<ExtractPagesResponse, ExtractPagesType>({
      query: data => ({
        url: "/pages/extract",
        method: "POST",
        body: data.body
      }),
      invalidatesTags: (_result, _error, arg) => {
        return [
          {type: "Document", id: arg.sourceDocID},
          {type: "Node", id: arg.sourceDocParentID},
          {type: "Node", id: arg.body.target_folder_id}
        ]
      }
    })
  })
})

export const {
  useGetDocumentQuery,
  useGetDocLastVersionQuery,
  useGetDocVersionsListQuery,
  useApplyPageOpChangesMutation,
  useMovePagesMutation,
  useExtractPagesMutation
} = apiSliceWithDocuments
