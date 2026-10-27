import FeedbackChatModal from "@/features/feedback/components/FeedbackChatModal"
import {useGetFeedbackUnreadQuery} from "@/features/feedback/feedbackApiSlice"
import {Indicator, Tooltip, UnstyledButton} from "@mantine/core"
import {useDisclosure} from "@mantine/hooks"
import {IconMessageCircle} from "@tabler/icons-react"
import {useEffect} from "react"
import {useTranslation} from "react-i18next"
import {useSearchParams} from "react-router-dom"

export default function FeedbackButton() {
  const {t} = useTranslation()
  const [opened, handlers] = useDisclosure(false)
  const [params, setParams] = useSearchParams()
  const {data} = useGetFeedbackUnreadQuery(undefined, {
    pollingInterval: 15000
  })
  const unread = data?.mine ?? 0
  const openFromUrl = params.get("feedback") === "1"

  useEffect(() => {
    if (!openFromUrl) {
      return
    }
    handlers.open()
    const next = new URLSearchParams(params)
    next.delete("feedback")
    setParams(next, {replace: true})
  }, [openFromUrl, params, setParams, handlers])

  return (
    <>
      <Tooltip label={t("feedback.tooltip")}>
        <Indicator
          disabled={unread <= 0}
          label={unread > 9 ? "9+" : unread}
          size={16}
          offset={4}
        >
          <UnstyledButton
            aria-label={t("feedback.tooltip")}
            onClick={handlers.open}
          >
            <IconMessageCircle />
          </UnstyledButton>
        </Indicator>
      </Tooltip>
      <FeedbackChatModal opened={opened} onClose={handlers.close} />
    </>
  )
}
