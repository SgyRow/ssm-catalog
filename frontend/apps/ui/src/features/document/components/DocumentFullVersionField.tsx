import {useAppSelector} from "@/app/hooks"
import NewsAttachmentPickerModal, {
  type AttachmentPick
} from "@/features/portal/components/NewsAttachmentPickerModal"
import {
  useGetDocumentFullVersionsQuery,
  usePutDocumentFullVersionsMutation
} from "@/features/library/libraryApiSlice"
import {useGetPortalRootQuery} from "@/features/portal/portalApiSlice"
import {makePortalDocumentNavState} from "@/features/portal/portalNavState"
import {
  DOCUMENT_FULL_VERSION_MANAGE,
  DOCUMENT_FULL_VERSION_VIEW,
  PORTAL_VIEW
} from "@/scopes"
import {selectCurrentUser} from "@/slices/currentUser"
import {drop_extension} from "@/utils"
import {Anchor, Button, Group, Stack, Text} from "@mantine/core"
import {useDisclosure} from "@mantine/hooks"
import {notifications} from "@mantine/notifications"
import {IconPaperclip} from "@tabler/icons-react"
import {useMemo, useState} from "react"
import {useTranslation} from "react-i18next"
import {Link} from "react-router-dom"

interface Props {
  documentId: string
}

export default function DocumentFullVersionField({documentId}: Props) {
  const {t} = useTranslation()
  const user = useAppSelector(selectCurrentUser)
  const scopes = user?.scopes ?? []
  const canView = scopes.includes(DOCUMENT_FULL_VERSION_VIEW)
  const canManage = scopes.includes(DOCUMENT_FULL_VERSION_MANAGE)
  const canBrowsePortal = scopes.includes(PORTAL_VIEW)

  const {data: attachments = [], isLoading} = useGetDocumentFullVersionsQuery(
    documentId,
    {skip: !canView}
  )
  const [putAttachments, {isLoading: saving}] =
    usePutDocumentFullVersionsMutation()
  const {data: portalRoot} = useGetPortalRootQuery(undefined, {
    skip: !canManage || !canBrowsePortal
  })

  const [pickOpen, pickHandlers] = useDisclosure(false)
  const [draft, setDraft] = useState<AttachmentPick[]>([])

  const documentNavState = useMemo(
    () => (portalRoot ? makePortalDocumentNavState(portalRoot) : null),
    [portalRoot]
  )

  if (!canView) {
    return null
  }

  const openPicker = () => {
    setDraft(
      attachments.map(att => ({
        node_id: att.node_id,
        title: att.title
      }))
    )
    pickHandlers.open()
  }

  const closePicker = async () => {
    try {
      await putAttachments({
        documentId,
        nodeIds: draft.map(item => item.node_id)
      }).unwrap()
      notifications.show({
        title: t("document.full_version_saved"),
        color: "green"
      })
    } catch {
      notifications.show({
        title: t("document.full_version_save_error"),
        color: "red"
      })
    } finally {
      pickHandlers.close()
    }
  }

  return (
    <Stack gap="xs" mt="md">
      <Text size="sm" fw={600}>
        {t("document.full_version")}
      </Text>
      {canManage ? (
        <Group gap="xs">
          <Button
            variant="light"
            size="compact-sm"
            leftSection={<IconPaperclip size={16} />}
            onClick={openPicker}
            loading={isLoading || saving}
            disabled={!canBrowsePortal || !portalRoot}
          >
            {t("document.full_version_manage")}
          </Button>
          {!canBrowsePortal ? (
            <Text size="xs" c="dimmed">
              {t("document.full_version_need_portal_view")}
            </Text>
          ) : null}
        </Group>
      ) : null}
      {attachments.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t("document.full_version_empty")}
        </Text>
      ) : (
        <Stack gap={4}>
          {attachments.map(att =>
            documentNavState ? (
              <Anchor
                key={att.node_id}
                component={Link}
                to={`/document/${att.node_id}`}
                state={documentNavState}
                size="sm"
              >
                {drop_extension(att.title)}
              </Anchor>
            ) : (
              <Anchor
                key={att.node_id}
                component={Link}
                to={`/document/${att.node_id}`}
                size="sm"
              >
                {drop_extension(att.title)}
              </Anchor>
            )
          )}
        </Stack>
      )}
      {portalRoot ? (
        <NewsAttachmentPickerModal
          opened={pickOpen}
          onClose={() => {
            void closePicker()
          }}
          portalRoot={portalRoot}
          value={draft}
          onChange={setDraft}
        />
      ) : null}
    </Stack>
  )
}
