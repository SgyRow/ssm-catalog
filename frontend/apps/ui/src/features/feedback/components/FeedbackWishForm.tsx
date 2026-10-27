import {useSendFeedbackWishMutation} from "@/features/feedback/feedbackApiSlice"
import {Button, Stack, Textarea, TextInput} from "@mantine/core"
import {notifications} from "@mantine/notifications"
import {useState} from "react"
import {useTranslation} from "react-i18next"

export default function FeedbackWishForm() {
  const {t} = useTranslation()
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [sendWish, {isLoading}] = useSendFeedbackWishMutation()

  const canSend = subject.trim().length > 0 && body.trim().length > 0

  const onSubmit = async () => {
    if (!canSend || isLoading) {
      return
    }
    try {
      await sendWish({
        subject: subject.trim(),
        body: body.trim()
      }).unwrap()
      setSubject("")
      setBody("")
      notifications.show({
        title: t("feedback.tab_wish"),
        message: t("feedback.wish_sent"),
        color: "green"
      })
    } catch {
      notifications.show({
        title: t("feedback.tab_wish"),
        message: t("library.load_error"),
        color: "red"
      })
    }
  }

  return (
    <Stack gap="sm">
      <TextInput
        label={t("feedback.wish_subject")}
        value={subject}
        onChange={e => setSubject(e.currentTarget.value)}
        maxLength={500}
      />
      <Textarea
        label={t("feedback.wish_body")}
        value={body}
        onChange={e => setBody(e.currentTarget.value)}
        minRows={6}
        autosize
        maxRows={12}
      />
      <Button onClick={() => void onSubmit()} disabled={!canSend} loading={isLoading}>
        {t("feedback.wish_submit")}
      </Button>
    </Stack>
  )
}
