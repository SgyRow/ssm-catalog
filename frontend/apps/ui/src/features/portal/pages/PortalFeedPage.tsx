import NewsAttachmentPickerModal, {
  type AttachmentPick
} from "@/features/portal/components/NewsAttachmentPickerModal"
import {
  useCreatePortalNewsMutation,
  useDeletePortalNewsMutation,
  useGetPortalFeedQuery,
  useGetPortalRootQuery,
  useUpdatePortalNewsMutation,
  type PortalNewsItem
} from "@/features/portal/portalApiSlice"
import {makePortalDocumentNavState} from "@/features/portal/portalNavState"
import {PORTAL_FEED_MANAGE, PORTAL_FEED_VIEW, PORTAL_VIEW} from "@/scopes"
import {selectCurrentUser} from "@/slices/currentUser"
import type {UserDetails} from "@/types"
import {formatApiDateTime} from "@/utils/formatDateTime"
import {drop_extension} from "@/utils"
import {
  Anchor,
  Button,
  Group,
  Loader,
  Modal,
  Pagination,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title
} from "@mantine/core"
import {useDisclosure} from "@mantine/hooks"
import {IconEdit, IconNews, IconPaperclip, IconPlus, IconTrash} from "@tabler/icons-react"
import {useMemo, useState} from "react"
import {useSelector} from "react-redux"
import {Link} from "react-router-dom"
import {useTranslation} from "react-i18next"

import classes from "@/components/ViewportPage.module.css"

export default function PortalFeedPage() {
  const {t} = useTranslation()
  const user = useSelector(selectCurrentUser) as UserDetails | null
  const scopes = user?.scopes ?? []
  const canView = scopes.includes(PORTAL_FEED_VIEW)
  const canManage = scopes.includes(PORTAL_FEED_MANAGE)
  const canBrowsePortal = scopes.includes(PORTAL_VIEW)

  const {data: portalRoot} = useGetPortalRootQuery(undefined, {
    skip: !canView || !canBrowsePortal
  })

  const documentNavState = useMemo(
    () => (portalRoot ? makePortalDocumentNavState(portalRoot) : null),
    [portalRoot]
  )

  const [page, setPage] = useState(1)
  const pageSize = 15

  const {data, isLoading, error, refetch} = useGetPortalFeedQuery(
    {page, page_size: pageSize},
    {skip: !canView}
  )

  const [createNews, {isLoading: creating}] = useCreatePortalNewsMutation()
  const [updateNews, {isLoading: updating}] = useUpdatePortalNewsMutation()
  const [deleteNews, {isLoading: isDeleting}] = useDeletePortalNewsMutation()

  const [editorOpen, editorHandlers] = useDisclosure(false)
  const [pickOpen, pickHandlers] = useDisclosure(false)
  const [editing, setEditing] = useState<PortalNewsItem | null>(null)
  const [formTitle, setFormTitle] = useState("")
  const [formBody, setFormBody] = useState("")
  const [attachmentPick, setAttachmentPick] = useState<AttachmentPick[]>([])

  const [deleteTarget, setDeleteTarget] = useState<PortalNewsItem | null>(null)

  const openCreate = () => {
    setEditing(null)
    setFormTitle("")
    setFormBody("")
    setAttachmentPick([])
    editorHandlers.open()
  }

  const openEdit = (item: PortalNewsItem) => {
    setEditing(item)
    setFormTitle(item.title)
    setFormBody(item.body)
    setAttachmentPick(
      (item.attachments ?? []).map(a => ({
        node_id: a.node_id,
        title: a.title
      }))
    )
    editorHandlers.open()
  }

  const closeEditor = () => {
    editorHandlers.close()
    setEditing(null)
  }

  const handleSave = async () => {
    const title = formTitle.trim()
    if (!title) {
      return
    }
    const ids = attachmentPick.map(a => a.node_id)
    if (editing) {
      await updateNews({
        id: editing.id,
        title,
        body: formBody,
        attachment_node_ids: ids
      }).unwrap()
    } else {
      await createNews({
        title,
        body: formBody,
        attachment_node_ids: ids
      }).unwrap()
    }
    closeEditor()
    void refetch()
  }

  const handleDelete = async () => {
    if (!deleteTarget) {
      return
    }
    await deleteNews(deleteTarget.id).unwrap()
    setDeleteTarget(null)
    void refetch()
  }

  if (!canView) {
    return (
      <Text p="md" c="dimmed">
        {t("portal.feed_forbidden")}
      </Text>
    )
  }

  if (isLoading) {
    return <Loader />
  }

  if (error || !data) {
    return (
      <Text p="md" c="red">
        {t("portal.feed_load_error")}
      </Text>
    )
  }

  const rows = data.items ?? []
  const numPages = data.num_pages ?? 1
  const busy = creating || updating

  return (
    <div className={classes.page}>
    <Stack className={classes.scroll} p="md" gap="lg">
      <Paper withBorder p="md" radius="md" shadow="xs">
        <Group justify="space-between" align="center" wrap="wrap" gap="md">
          <Group gap="sm" align="center" wrap="wrap">
            <IconNews size={26} aria-hidden />
            <Title order={3}>{t("portal.feed_title")}</Title>
          </Group>
          {canManage ? (
            <Button leftSection={<IconPlus size={18} />} onClick={openCreate}>
              {t("portal.news_new")}
            </Button>
          ) : null}
        </Group>
      </Paper>

      {rows.length === 0 ? (
        <Paper withBorder p="lg">
          <Text c="dimmed">{t("portal.feed_empty")}</Text>
        </Paper>
      ) : (
        <Stack gap="md">
          {rows.map(item => (
            <Paper key={item.id} withBorder p="md" shadow="xs">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={6} style={{flex: 1, minWidth: 0}}>
                  <Title order={4}>{item.title}</Title>
                  <Text size="sm" c="dimmed">
                    {formatApiDateTime(item.created_at)}
                    {item.author_username
                      ? ` · ${t("portal.feed_author")}: ${item.author_username}`
                      : null}
                  </Text>
                  <Text size="sm" style={{whiteSpace: "pre-wrap"}}>
                    {item.body || "—"}
                  </Text>
                  {(item.attachments ?? []).length > 0 ? (
                    <Stack gap={4} mt="xs">
                      <Text size="sm" fw={600}>
                        {t("portal.news_attachments")}
                      </Text>
                      <Stack gap={4}>
                        {(item.attachments ?? []).map(att =>
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
                            <Text key={att.node_id} size="sm">
                              {drop_extension(att.title)}
                            </Text>
                          )
                        )}
                      </Stack>
                    </Stack>
                  ) : null}
                </Stack>
                {canManage ? (
                  <Group gap="xs" wrap="nowrap">
                    <Button
                      variant="default"
                      size="compact-sm"
                      leftSection={<IconEdit size={16} />}
                      onClick={() => openEdit(item)}
                    >
                      {t("common.edit")}
                    </Button>
                    <Button
                      variant="light"
                      color="red"
                      size="compact-sm"
                      leftSection={<IconTrash size={16} />}
                      loading={isDeleting}
                      onClick={() => setDeleteTarget(item)}
                    >
                      {t("common.delete")}
                    </Button>
                  </Group>
                ) : null}
              </Group>
            </Paper>
          ))}
        </Stack>
      )}

      {numPages > 1 ? (
        <Pagination
          total={numPages}
          value={page}
          onChange={setPage}
          mt="sm"
        />
      ) : null}

      <Modal
        opened={editorOpen}
        onClose={closeEditor}
        title={editing ? t("portal.news_edit") : t("portal.news_new")}
        size="lg"
      >
        <Stack gap="sm">
          <TextInput
            label={t("portal.news_title")}
            value={formTitle}
            onChange={e => setFormTitle(e.currentTarget.value)}
            required
          />
          <Textarea
            label={t("portal.news_body")}
            value={formBody}
            onChange={e => setFormBody(e.currentTarget.value)}
            minRows={6}
            autosize
            maxRows={20}
          />
          {canManage && canBrowsePortal && portalRoot ? (
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                {t("portal.news_attachments")}
              </Text>
              <Group gap="xs">
                <Button
                  variant="light"
                  size="compact-sm"
                  leftSection={<IconPaperclip size={16} />}
                  onClick={pickHandlers.open}
                >
                  {t("portal.news_manage_attachments")}
                </Button>
                <Text size="xs" c="dimmed">
                  {attachmentPick.length > 0
                    ? t("portal.news_attachments_count", {
                        count: attachmentPick.length
                      })
                    : t("portal.news_no_attachments_selected")}
                </Text>
              </Group>
            </Stack>
          ) : canManage && !canBrowsePortal ? (
            <Text size="xs" c="dimmed">
              {t("portal.news_attachments_need_portal_view")}
            </Text>
          ) : null}
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={closeEditor}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void handleSave()} loading={busy}>
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {portalRoot ? (
        <NewsAttachmentPickerModal
          opened={pickOpen}
          onClose={pickHandlers.close}
          portalRoot={portalRoot}
          value={attachmentPick}
          onChange={setAttachmentPick}
        />
      ) : null}

      <Modal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t("portal.news_delete_title")}
      >
        <Stack gap="md">
          <Text size="sm">{t("portal.news_delete_confirm")}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button color="red" onClick={() => void handleDelete()}>
              {t("common.delete")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
    </div>
  )
}
