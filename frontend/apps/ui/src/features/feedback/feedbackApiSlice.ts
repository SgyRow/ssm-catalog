import {apiSlice} from "@/features/api/slice"

function clearMineUnread(dispatch: (action: unknown) => void) {
  let hadUnread = false
  dispatch(
    injected.util.updateQueryData("getFeedbackUnread", undefined, draft => {
      hadUnread = draft.mine > 0
      draft.mine = 0
    })
  )
  if (hadUnread) {
    dispatch(apiSlice.util.invalidateTags(["LibraryNotifications"]))
  }
}

function clearThreadUnread(
  dispatch: (action: unknown) => void,
  threadId: string
) {
  let cleared = 0
  dispatch(
    injected.util.updateQueryData("getFeedbackThreads", undefined, draft => {
      for (const item of draft) {
        if (item.id === threadId) {
          cleared = item.unread_for_staff
          item.unread_for_staff = 0
        }
      }
    })
  )
  dispatch(
    injected.util.updateQueryData("getFeedbackUnread", undefined, draft => {
      draft.inbox = Math.max(0, draft.inbox - cleared)
    })
  )
  if (cleared > 0) {
    dispatch(apiSlice.util.invalidateTags(["LibraryNotifications"]))
  }
}

export type FeedbackMessage = {
  id: string
  body: string
  from_staff: boolean
  author_name: string
  created_at: string
}

export type FeedbackMyThread = {
  id: string | null
  unread: number
  messages: FeedbackMessage[]
}

export type FeedbackThread = {
  id: string
  user_id: string
  username: string
  last_preview: string
  last_message_at: string
  unread_for_staff: number
}

export type FeedbackThreadDetail = {
  id: string
  user_id: string
  username: string
  unread_for_staff: number
  messages: FeedbackMessage[]
}

export type FeedbackUnread = {
  mine: number
  inbox: number
}

export type FeedbackWish = {
  id: string
  subject: string
  body: string
  author_name: string
  created_at: string
  read_at: string | null
}

const injected = apiSlice.injectEndpoints({
  endpoints: builder => ({
    getFeedbackUnread: builder.query<FeedbackUnread, void>({
      query: () => "/feedback/unread",
      providesTags: ["Feedback"]
    }),
    getMyFeedbackThread: builder.query<FeedbackMyThread, void>({
      query: () => "/feedback/me",
      providesTags: ["Feedback"],
      async onQueryStarted(_arg, {dispatch, queryFulfilled}) {
        try {
          await queryFulfilled
          clearMineUnread(dispatch)
        } catch {
          /* keep cached unread if the request failed */
        }
      }
    }),
    sendMyFeedbackMessage: builder.mutation<FeedbackMessage, {body: string}>({
      query: body => ({
        url: "/feedback/me/messages",
        method: "POST",
        body
      }),
      invalidatesTags: ["Feedback", "LibraryNotifications"]
    }),
    getFeedbackThreads: builder.query<FeedbackThread[], void>({
      query: () => "/feedback/threads",
      providesTags: ["Feedback"]
    }),
    getFeedbackThread: builder.query<FeedbackThreadDetail, string>({
      query: threadId => `/feedback/threads/${threadId}`,
      providesTags: ["Feedback"],
      async onQueryStarted(threadId, {dispatch, queryFulfilled}) {
        try {
          await queryFulfilled
          clearThreadUnread(dispatch, threadId)
        } catch {
          /* keep cached unread if the request failed */
        }
      }
    }),
    replyFeedbackThread: builder.mutation<
      FeedbackMessage,
      {threadId: string; body: string}
    >({
      query: ({threadId, body}) => ({
        url: `/feedback/threads/${threadId}/messages`,
        method: "POST",
        body: {body}
      }),
      invalidatesTags: ["Feedback", "LibraryNotifications"]
    }),
    deleteFeedbackMessage: builder.mutation<
      void,
      {threadId: string; messageId: string}
    >({
      query: ({threadId, messageId}) => ({
        url: `/feedback/threads/${threadId}/messages/${messageId}`,
        method: "DELETE"
      }),
      invalidatesTags: ["Feedback"]
    }),
    deleteFeedbackThread: builder.mutation<void, string>({
      query: threadId => ({
        url: `/feedback/threads/${threadId}`,
        method: "DELETE"
      }),
      invalidatesTags: ["Feedback", "LibraryNotifications"]
    }),
    sendFeedbackWish: builder.mutation<
      FeedbackWish,
      {subject: string; body: string}
    >({
      query: body => ({
        url: "/feedback/wishes",
        method: "POST",
        body
      }),
      invalidatesTags: ["Feedback", "LibraryNotifications"]
    }),
    getFeedbackWishes: builder.query<FeedbackWish[], void>({
      query: () => "/feedback/wishes",
      providesTags: ["Feedback"]
    }),
    getFeedbackWish: builder.query<FeedbackWish, string>({
      query: wishId => `/feedback/wishes/${wishId}`,
      providesTags: ["Feedback"],
      async onQueryStarted(wishId, {dispatch, queryFulfilled}) {
        try {
          await queryFulfilled
          let cleared = false
          dispatch(
            injected.util.updateQueryData("getFeedbackWishes", undefined, draft => {
              for (const item of draft) {
                if (item.id === wishId && !item.read_at) {
                  item.read_at = new Date().toISOString()
                  cleared = true
                }
              }
            })
          )
          if (cleared) {
            dispatch(
              injected.util.updateQueryData("getFeedbackUnread", undefined, draft => {
                draft.inbox = Math.max(0, draft.inbox - 1)
              })
            )
            dispatch(apiSlice.util.invalidateTags(["LibraryNotifications"]))
          }
        } catch {
          /* keep cached unread if the request failed */
        }
      }
    })
  })
})

export const {
  useGetFeedbackUnreadQuery,
  useGetMyFeedbackThreadQuery,
  useSendMyFeedbackMessageMutation,
  useGetFeedbackThreadsQuery,
  useGetFeedbackThreadQuery,
  useReplyFeedbackThreadMutation,
  useDeleteFeedbackMessageMutation,
  useDeleteFeedbackThreadMutation,
  useSendFeedbackWishMutation,
  useGetFeedbackWishesQuery,
  useGetFeedbackWishQuery
} = injected
