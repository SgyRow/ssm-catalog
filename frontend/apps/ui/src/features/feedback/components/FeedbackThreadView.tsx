import classes from "@/features/feedback/FeedbackChat.module.css"
import type {FeedbackMessage} from "@/features/feedback/feedbackApiSlice"
import {formatApiDateTimeCompact} from "@/utils/formatDateTime"
import {ActionIcon, Button, Group, Text, Textarea} from "@mantine/core"
import {IconSend, IconTrash} from "@tabler/icons-react"
import {useEffect, useRef, useState} from "react"
import {useTranslation} from "react-i18next"

type Args = {
  messages: FeedbackMessage[]
  mineIsStaff: boolean
  sending?: boolean
  fill?: boolean
  emptyHint: string
  onSend: (body: string) => Promise<void> | void
  onDeleteMessage?: (messageId: string) => void
}

export default function FeedbackThreadView({
  messages,
  mineIsStaff,
  sending,
  fill,
  emptyHint,
  onSend,
  onDeleteMessage
}: Args) {
  const {t} = useTranslation()
  const [draft, setDraft] = useState("")
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages.length])

  const send = async () => {
    const text = draft.trim()
    if (!text || sending) {
      return
    }
    await onSend(text)
    setDraft("")
  }

  return (
    <div className={`${classes.root} ${fill ? classes.fill : ""}`}>
      <div ref={listRef} className={classes.messages}>
        {messages.length === 0 ? (
          <Text c="dimmed" size="sm" className={classes.empty}>
            {emptyHint}
          </Text>
        ) : (
          messages.map(item => {
            const mine = item.from_staff === mineIsStaff
            return (
              <div
                key={item.id}
                className={`${classes.bubble} ${mine ? classes.mine : classes.theirs}`}
              >
                <span className={classes.metaRow}>
                  <span className={classes.meta}>
                    {item.author_name}
                    {" · "}
                    {formatApiDateTimeCompact(item.created_at)}
                  </span>
                  {onDeleteMessage ? (
                    <ActionIcon
                      variant="subtle"
                      color={mine ? "gray.0" : "red"}
                      size="sm"
                      aria-label={t("feedback.delete_message")}
                      onClick={() => onDeleteMessage(item.id)}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  ) : null}
                </span>
                {item.body}
              </div>
            )
          })
        )}
      </div>
      <Group className={classes.composer} align="flex-end" gap="sm" wrap="nowrap">
        <Textarea
          autosize
          minRows={1}
          maxRows={5}
          style={{flex: 1}}
          placeholder={t("feedback.placeholder")}
          value={draft}
          onChange={e => setDraft(e.currentTarget.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          aria-label={t("feedback.placeholder")}
        />
        <Button
          onClick={() => void send()}
          disabled={!draft.trim()}
          loading={sending}
          leftSection={<IconSend size={16} />}
        >
          {t("feedback.send")}
        </Button>
      </Group>
    </div>
  )
}
