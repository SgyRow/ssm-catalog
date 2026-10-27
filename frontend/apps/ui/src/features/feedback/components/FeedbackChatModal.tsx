import FeedbackThreadView from "@/features/feedback/components/FeedbackThreadView"
import FeedbackWishForm from "@/features/feedback/components/FeedbackWishForm"
import {
  useGetMyFeedbackThreadQuery,
  useSendMyFeedbackMessageMutation
} from "@/features/feedback/feedbackApiSlice"
import {FEEDBACK_MANAGE} from "@/scopes"
import {selectCurrentUser} from "@/slices/currentUser"
import type {UserDetails} from "@/types"
import {Anchor, Modal, Stack, Tabs} from "@mantine/core"
import {useTranslation} from "react-i18next"
import {useSelector} from "react-redux"
import {Link} from "react-router-dom"

type Args = {
  opened: boolean
  onClose: () => void
}

export default function FeedbackChatModal({opened, onClose}: Args) {
  const {t} = useTranslation()
  const user = useSelector(selectCurrentUser) as UserDetails | null
  const canManage =
    Boolean(user?.is_superuser) ||
    (user?.scopes ?? []).includes(FEEDBACK_MANAGE)
  const {data} = useGetMyFeedbackThreadQuery(undefined, {
    skip: !opened,
    pollingInterval: opened ? 5000 : 0
  })
  const [sendMine, {isLoading: sending}] = useSendMyFeedbackMessageMutation()

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("feedback.title")}
      size="md"
      centered
    >
      <Tabs defaultValue="help">
        <Tabs.List mb="sm">
          <Tabs.Tab value="help">{t("feedback.tab_help")}</Tabs.Tab>
          <Tabs.Tab value="wish">{t("feedback.tab_wish")}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="help">
          <Stack gap="sm">
            {canManage ? (
              <Anchor component={Link} to="/feedback" size="sm" onClick={onClose}>
                {t("feedback.open_inbox")}
              </Anchor>
            ) : null}
            <FeedbackThreadView
              messages={data?.messages ?? []}
              mineIsStaff={false}
              sending={sending}
              emptyHint={t("feedback.empty")}
              onSend={async body => {
                await sendMine({body}).unwrap()
              }}
            />
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="wish">
          <FeedbackWishForm />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  )
}
