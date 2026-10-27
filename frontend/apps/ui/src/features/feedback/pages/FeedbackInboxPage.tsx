import classes from "@/features/feedback/FeedbackInbox.module.css"
import FeedbackThreadView from "@/features/feedback/components/FeedbackThreadView"
import {
  useDeleteFeedbackMessageMutation,
  useDeleteFeedbackThreadMutation,
  useGetFeedbackThreadQuery,
  useGetFeedbackThreadsQuery,
  useGetFeedbackWishQuery,
  useGetFeedbackWishesQuery,
  useReplyFeedbackThreadMutation
} from "@/features/feedback/feedbackApiSlice"
import {FEEDBACK_MANAGE} from "@/scopes"
import {selectCurrentUser} from "@/slices/currentUser"
import type {UserDetails} from "@/types"
import {formatApiDateTimeCompact} from "@/utils/formatDateTime"
import {Badge, Button, Group, Loader, Modal, Tabs, Text, Title} from "@mantine/core"
import {notifications} from "@mantine/notifications"
import {IconTrash} from "@tabler/icons-react"
import {useState} from "react"
import {useTranslation} from "react-i18next"
import {useSelector} from "react-redux"
import {useSearchParams} from "react-router-dom"

import AccessForbidden from "@/pages/errors/AccessForbidden"

export default function FeedbackInboxPage() {
  const {t} = useTranslation()
  const user = useSelector(selectCurrentUser) as UserDetails | null
  const canManage =
    Boolean(user?.is_superuser) ||
    (user?.scopes ?? []).includes(FEEDBACK_MANAGE)
  const [params, setParams] = useSearchParams()
  const selectedThreadId = params.get("thread")
  const selectedWishId = params.get("wish")
  const tab = selectedWishId || params.get("tab") === "wishes" ? "wishes" : "chats"
  const {data: threads, isLoading} = useGetFeedbackThreadsQuery(undefined, {
    skip: !canManage,
    pollingInterval: canManage ? 8000 : 0
  })
  const {data: wishes, isLoading: wishesLoading} = useGetFeedbackWishesQuery(
    undefined,
    {
      skip: !canManage,
      pollingInterval: canManage ? 8000 : 0
    }
  )
  const {data: detail} = useGetFeedbackThreadQuery(selectedThreadId ?? "", {
    skip: !canManage || !selectedThreadId,
    pollingInterval: selectedThreadId ? 5000 : 0
  })
  const {data: wish} = useGetFeedbackWishQuery(selectedWishId ?? "", {
    skip: !canManage || !selectedWishId
  })
  const [reply, {isLoading: sending}] = useReplyFeedbackThreadMutation()
  const [deleteMessage, {isLoading: deletingMessage}] =
    useDeleteFeedbackMessageMutation()
  const [deleteThread, {isLoading: deletingThread}] =
    useDeleteFeedbackThreadMutation()
  const [pendingDelete, setPendingDelete] = useState<
    {kind: "thread"; id: string} | {kind: "message"; id: string} | null
  >(null)

  if (!user) {
    return <Loader />
  }
  if (!canManage) {
    return <AccessForbidden />
  }
  if (isLoading || wishesLoading) {
    return <Loader />
  }

  const items = threads ?? []
  const wishItems = wishes ?? []
  const unreadWishes = wishItems.filter(item => !item.read_at).length

  const setTab = (value: string | null) => {
    const next = new URLSearchParams()
    if (value === "wishes") {
      next.set("tab", "wishes")
      if (selectedWishId) {
        next.set("wish", selectedWishId)
      }
    } else if (selectedThreadId) {
      next.set("thread", selectedThreadId)
    }
    setParams(next, {replace: true})
  }

  return (
    <div className={classes.page}>
      <Title order={3}>{t("feedback.inbox")}</Title>
      <Tabs value={tab} onChange={setTab}>
        <Tabs.List>
          <Tabs.Tab value="chats">{t("feedback.inbox_chats")}</Tabs.Tab>
          <Tabs.Tab value="wishes">
            {t("feedback.tab_wish")}
            {unreadWishes > 0 ? (
              <Badge size="sm" circle ml={8}>
                {unreadWishes}
              </Badge>
            ) : null}
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>
      {tab === "wishes" ? (
        <div className={classes.body}>
          <div className={classes.list}>
            {wishItems.length === 0 ? (
              <Text c="dimmed" p="md">
                {t("feedback.inbox_wishes_empty")}
              </Text>
            ) : (
              wishItems.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`${classes.item} ${item.id === selectedWishId ? classes.itemActive : ""}`}
                  onClick={() => {
                    const next = new URLSearchParams()
                    next.set("tab", "wishes")
                    next.set("wish", item.id)
                    setParams(next, {replace: true})
                  }}
                >
                  <span className={classes.itemTitle}>
                    {item.subject}
                    {item.id !== selectedWishId && !item.read_at ? (
                      <Badge size="sm" circle>
                        1
                      </Badge>
                    ) : null}
                  </span>
                  <span className={classes.preview}>
                    {item.author_name}
                    {" · "}
                    {formatApiDateTimeCompact(item.created_at)}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className={classes.chat}>
            {selectedWishId && wish ? (
              <div className={classes.wish}>
                <Text fw={650}>{wish.subject}</Text>
                <Text size="sm" c="dimmed">
                  {wish.author_name}
                  {" · "}
                  {formatApiDateTimeCompact(wish.created_at)}
                </Text>
                <Text className={classes.wishBody}>{wish.body}</Text>
              </div>
            ) : (
              <Text c="dimmed" p="md">
                {t("feedback.inbox_pick_wish")}
              </Text>
            )}
          </div>
        </div>
      ) : (
        <div className={classes.body}>
          <div className={classes.list}>
            {items.length === 0 ? (
              <Text c="dimmed" p="md">
                {t("feedback.inbox_empty")}
              </Text>
            ) : (
              items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`${classes.item} ${item.id === selectedThreadId ? classes.itemActive : ""}`}
                  onClick={() => {
                    const next = new URLSearchParams()
                    next.set("thread", item.id)
                    setParams(next, {replace: true})
                  }}
                >
                  <span className={classes.itemTitle}>
                    {item.username}
                    {item.id !== selectedThreadId && item.unread_for_staff > 0 ? (
                      <Badge size="sm" circle>
                        {item.unread_for_staff}
                      </Badge>
                    ) : null}
                  </span>
                  <span className={classes.preview}>
                    {formatApiDateTimeCompact(item.last_message_at)}
                    {item.last_preview ? ` · ${item.last_preview}` : ""}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className={classes.chat}>
            {selectedThreadId && detail ? (
              <>
                <Group
                  className={classes.chatHead}
                  justify="space-between"
                  wrap="nowrap"
                >
                  <Text fw={650}>{detail.username}</Text>
                  <Button
                    variant="subtle"
                    color="red"
                    size="compact-sm"
                    leftSection={<IconTrash size={14} />}
                    onClick={() =>
                      setPendingDelete({kind: "thread", id: selectedThreadId})
                    }
                  >
                    {t("feedback.delete_chat")}
                  </Button>
                </Group>
                <FeedbackThreadView
                  messages={detail.messages}
                  mineIsStaff
                  fill
                  sending={sending}
                  emptyHint={t("feedback.empty")}
                  onSend={async body => {
                    await reply({threadId: selectedThreadId, body}).unwrap()
                  }}
                  onDeleteMessage={messageId =>
                    setPendingDelete({kind: "message", id: messageId})
                  }
                />
              </>
            ) : (
              <Text c="dimmed" p="md">
                {t("feedback.inbox_pick")}
              </Text>
            )}
          </div>
        </div>
      )}
      <Modal
        opened={pendingDelete !== null}
        onClose={() => {
          if (!deletingMessage && !deletingThread) {
            setPendingDelete(null)
          }
        }}
        title={
          pendingDelete?.kind === "thread"
            ? t("feedback.delete_chat")
            : t("feedback.delete_message")
        }
      >
        <Text>
          {pendingDelete?.kind === "thread"
            ? t("feedback.delete_chat_confirm")
            : t("feedback.delete_message_confirm")}
        </Text>
        <Group justify="flex-end" mt="md">
          <Button
            variant="default"
            onClick={() => setPendingDelete(null)}
            disabled={deletingMessage || deletingThread}
          >
            {t("common.cancel")}
          </Button>
          <Button
            color="red"
            loading={deletingMessage || deletingThread}
            onClick={() => {
              if (!pendingDelete) {
                return
              }
              const task =
                pendingDelete.kind === "thread"
                  ? deleteThread(pendingDelete.id).unwrap()
                  : selectedThreadId
                    ? deleteMessage({
                        threadId: selectedThreadId,
                        messageId: pendingDelete.id
                      }).unwrap()
                    : Promise.resolve()
              void task
                .then(() => {
                  if (
                    pendingDelete.kind === "thread" &&
                    selectedThreadId === pendingDelete.id
                  ) {
                    setParams(new URLSearchParams(), {replace: true})
                  }
                  setPendingDelete(null)
                })
                .catch(() => {
                  notifications.show({
                    message: t("feedback.delete_error"),
                    color: "red"
                  })
                })
            }}
          >
            {t("common.delete")}
          </Button>
        </Group>
      </Modal>
    </div>
  )
}
