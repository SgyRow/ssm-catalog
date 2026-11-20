import classes from "@/components/ViewportPage.module.css"
import {uploadConvertsToPdf} from "@/features/document/documentPreview"
import cardClasses from "@/features/handbook/Handbook.module.css"
import {
  useCreateHandbookArticleMutation,
  useCreateHandbookDocumentMutation,
  useCreateHandbookFolderMutation,
  useDeleteHandbookArticleMutation,
  useDeleteHandbookFolderMutation,
  useGetHandbookArticlesQuery,
  useGetHandbookFoldersQuery,
  useUpdateHandbookFolderMutation,
  type HandbookArticle,
  type HandbookFolder
} from "@/features/handbook/handbookApiSlice"
import {PORTAL_FEED_MANAGE} from "@/scopes"
import {selectCurrentUser} from "@/slices/currentUser"
import type {UserDetails} from "@/types"
import {formatApiDateTimeCompact} from "@/utils/formatDateTime"
import {
  Accordion,
  ActionIcon,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title
} from "@mantine/core"
import {notifications} from "@mantine/notifications"
import {
  IconFile,
  IconFolder,
  IconFolderPlus,
  IconPencil,
  IconPlus,
  IconTrash,
  IconUpload
} from "@tabler/icons-react"
import {useMemo, useRef, useState} from "react"
import {useSelector} from "react-redux"
import {Link, useNavigate} from "react-router-dom"
import {useTranslation} from "react-i18next"

export default function HandbookPage() {
  const {t} = useTranslation()
  const navigate = useNavigate()
  const user = useSelector(selectCurrentUser) as UserDetails | null
  const canManage =
    Boolean(user?.is_superuser) ||
    (user?.scopes ?? []).includes(PORTAL_FEED_MANAGE)
  const {data, isLoading, error} = useGetHandbookArticlesQuery()
  const {
    data: folders = [],
    isLoading: foldersLoading,
    error: foldersError
  } = useGetHandbookFoldersQuery()
  const [createArticle, {isLoading: creating}] =
    useCreateHandbookArticleMutation()
  const [deleteArticle] = useDeleteHandbookArticleMutation()
  const [createDocument, {isLoading: uploading}] =
    useCreateHandbookDocumentMutation()
  const [createFolder, {isLoading: creatingFolder}] =
    useCreateHandbookFolderMutation()
  const [updateFolder, {isLoading: renamingFolder}] =
    useUpdateHandbookFolderMutation()
  const [deleteFolder, {isLoading: deletingFolder}] =
    useDeleteHandbookFolderMutation()
  const docInput = useRef<HTMLInputElement>(null)
  const [uploadFolderId, setUploadFolderId] = useState<string | null>(null)
  const [folderModal, setFolderModal] = useState<
    {mode: "create"} | {mode: "rename"; folder: HandbookFolder} | null
  >(null)
  const [folderTitleDraft, setFolderTitleDraft] = useState("")

  const articlesByFolder = useMemo(() => {
    const map = new Map<string | null, HandbookArticle[]>()
    map.set(null, [])
    for (const folder of folders) {
      map.set(folder.id, [])
    }
    for (const item of data ?? []) {
      const key =
        item.folder_id && map.has(item.folder_id) ? item.folder_id : null
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    return map
  }, [data, folders])

  const onCreate = async (folderId: string | null = null) => {
    const created = await createArticle({
      title: t("handbook.new_title"),
      body: "",
      folder_id: folderId
    }).unwrap()
    navigate(`/handbook/${created.id}`)
  }

  const onUploadDocument = async (file: File, folderId: string | null) => {
    if (uploadConvertsToPdf(file.name)) {
      notifications.show({
        message: t("nodes.upload.pdf_conversion_notice"),
        color: "blue",
        autoClose: 6000
      })
    }
    try {
      const created = await createDocument({
        file,
        folder_id: folderId
      }).unwrap()
      navigate(`/handbook/${created.id}`)
    } catch {
      notifications.show({
        message: t("handbook.upload_failed"),
        color: "red"
      })
    }
  }

  const openCreateFolder = () => {
    setFolderTitleDraft("")
    setFolderModal({mode: "create"})
  }

  const openRenameFolder = (folder: HandbookFolder) => {
    setFolderTitleDraft(folder.title)
    setFolderModal({mode: "rename", folder})
  }

  const saveFolderModal = async () => {
    const title = folderTitleDraft.trim()
    if (!title || !folderModal) {
      return
    }
    try {
      if (folderModal.mode === "create") {
        await createFolder({title}).unwrap()
        notifications.show({
          color: "green",
          message: t("handbook.folder_created")
        })
      } else {
        await updateFolder({
          id: folderModal.folder.id,
          title
        }).unwrap()
        notifications.show({
          color: "green",
          message: t("handbook.folder_renamed")
        })
      }
      setFolderModal(null)
    } catch {
      notifications.show({
        color: "red",
        message: t("handbook.folder_save_error")
      })
    }
  }

  const onDeleteFolder = async (folder: HandbookFolder) => {
    if (
      !window.confirm(
        t("handbook.folder_delete_confirm", {title: folder.title})
      )
    ) {
      return
    }
    try {
      await deleteFolder(folder.id).unwrap()
      notifications.show({
        color: "green",
        message: t("handbook.folder_deleted")
      })
    } catch {
      notifications.show({
        color: "red",
        message: t("handbook.folder_delete_error")
      })
    }
  }

  const renderArticle = (item: HandbookArticle) => (
    <Group
      key={item.id}
      justify="space-between"
      wrap="nowrap"
      align="flex-start"
    >
      <Link
        className={cardClasses.card}
        to={`/handbook/${item.id}`}
        style={{flex: 1}}
      >
        <Group gap={6} align="center" wrap="nowrap">
          {item.kind === "file" ? (
            <IconFile size={16} style={{flexShrink: 0}} />
          ) : null}
          <Text fw={650}>{item.title}</Text>
        </Group>
        <Text size="sm" c="dimmed">
          {formatApiDateTimeCompact(item.updated_at)}
          {item.author_username ? ` · ${item.author_username}` : ""}
        </Text>
      </Link>
      {canManage ? (
        <Button
          variant="subtle"
          color="red"
          size="compact-sm"
          leftSection={<IconTrash size={14} />}
          onClick={() => void deleteArticle(item.id)}
        >
          {t("common.delete")}
        </Button>
      ) : null}
    </Group>
  )

  const renderFolderActions = (folderId: string | null) =>
    canManage ? (
      <Group gap={4} wrap="nowrap">
        <Button
          size="xs"
          variant="light"
          leftSection={<IconPlus size={14} />}
          loading={creating}
          onClick={e => {
            e.preventDefault()
            e.stopPropagation()
            void onCreate(folderId)
          }}
        >
          {t("handbook.create")}
        </Button>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconUpload size={14} />}
          loading={uploading}
          onClick={e => {
            e.preventDefault()
            e.stopPropagation()
            setUploadFolderId(folderId)
            docInput.current?.click()
          }}
        >
          {t("handbook.upload_document")}
        </Button>
      </Group>
    ) : null

  if (isLoading || foldersLoading) {
    return <Loader />
  }

  if (error || foldersError) {
    return (
      <Text p="md" c="red">
        {t("handbook.load_error")}
      </Text>
    )
  }

  const uncategorized = articlesByFolder.get(null) ?? []
  const hasAnything = folders.length > 0 || (data ?? []).length > 0

  return (
    <div className={classes.page}>
      <Stack className={classes.scroll} p="md" gap="md">
        <Group justify="space-between" align="center">
          <Title order={3}>{t("handbook.title")}</Title>
          {canManage ? (
            <Group gap="xs">
              <Button
                variant="light"
                leftSection={<IconFolderPlus size={16} />}
                onClick={openCreateFolder}
                loading={creatingFolder}
              >
                {t("handbook.add_folder")}
              </Button>
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => void onCreate(null)}
                loading={creating}
              >
                {t("handbook.create")}
              </Button>
              <Button
                variant="light"
                leftSection={<IconUpload size={16} />}
                onClick={() => {
                  setUploadFolderId(null)
                  docInput.current?.click()
                }}
                loading={uploading}
              >
                {t("handbook.upload_document")}
              </Button>
            </Group>
          ) : null}
        </Group>

        {!hasAnything ? (
          <Text c="dimmed">{t("handbook.empty")}</Text>
        ) : (
          <Stack gap="sm">
            {folders.length > 0 ? (
              <Accordion
                multiple
                chevronPosition="left"
                variant="separated"
                defaultValue={folders.map(f => f.id)}
              >
                {folders.map(folder => {
                  const items = articlesByFolder.get(folder.id) ?? []
                  return (
                    <Accordion.Item key={folder.id} value={folder.id}>
                      <Group
                        justify="space-between"
                        wrap="nowrap"
                        gap="xs"
                        pr="xs"
                      >
                        <Accordion.Control style={{flex: 1}}>
                          <Group gap="sm" wrap="nowrap">
                            <ThemeIcon
                              variant="light"
                              color="yellow"
                              size="sm"
                              radius="md"
                              aria-hidden
                            >
                              <IconFolder size={14} stroke={1.5} />
                            </ThemeIcon>
                            <Text size="sm" fw={600}>
                              {folder.title}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {items.length}
                            </Text>
                          </Group>
                        </Accordion.Control>
                        {canManage ? (
                          <Group gap={4} wrap="nowrap">
                            {renderFolderActions(folder.id)}
                            <ActionIcon
                              variant="subtle"
                              aria-label={t("handbook.rename_folder")}
                              onClick={e => {
                                e.preventDefault()
                                e.stopPropagation()
                                openRenameFolder(folder)
                              }}
                            >
                              <IconPencil size={14} stroke={1.5} />
                            </ActionIcon>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              aria-label={t("handbook.delete_folder")}
                              loading={deletingFolder}
                              onClick={e => {
                                e.preventDefault()
                                e.stopPropagation()
                                void onDeleteFolder(folder)
                              }}
                            >
                              <IconTrash size={14} stroke={1.5} />
                            </ActionIcon>
                          </Group>
                        ) : null}
                      </Group>
                      <Accordion.Panel>
                        {items.length === 0 ? (
                          <Text size="sm" c="dimmed">
                            {t("handbook.folder_empty")}
                          </Text>
                        ) : (
                          <Stack gap="sm">{items.map(renderArticle)}</Stack>
                        )}
                      </Accordion.Panel>
                    </Accordion.Item>
                  )
                })}
              </Accordion>
            ) : null}

            {uncategorized.length > 0 || folders.length > 0 ? (
              <Stack gap="sm">
                {folders.length > 0 ? (
                  <Group justify="space-between" align="center">
                    <Group gap="sm">
                      <ThemeIcon
                        variant="light"
                        color="gray"
                        size="sm"
                        radius="md"
                        aria-hidden
                      >
                        <IconFolder size={14} stroke={1.5} />
                      </ThemeIcon>
                      <Text size="sm" fw={600}>
                        {t("handbook.uncategorized")}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {uncategorized.length}
                      </Text>
                    </Group>
                    {renderFolderActions(null)}
                  </Group>
                ) : null}
                {uncategorized.length === 0 && folders.length > 0 ? (
                  <Text size="sm" c="dimmed">
                    {t("handbook.folder_empty")}
                  </Text>
                ) : (
                  <Stack gap="sm">{uncategorized.map(renderArticle)}</Stack>
                )}
              </Stack>
            ) : null}
          </Stack>
        )}
      </Stack>

      <Modal
        opened={folderModal !== null}
        onClose={() => setFolderModal(null)}
        title={
          folderModal?.mode === "rename"
            ? t("handbook.rename_folder")
            : t("handbook.add_folder")
        }
      >
        <Stack gap="sm">
          <TextInput
            label={t("handbook.folder_title")}
            value={folderTitleDraft}
            onChange={e => setFolderTitleDraft(e.currentTarget.value)}
            data-autofocus
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault()
                void saveFolderModal()
              }
            }}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setFolderModal(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              loading={creatingFolder || renamingFolder}
              disabled={!folderTitleDraft.trim()}
              onClick={() => void saveFolderModal()}
            >
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {canManage ? (
        <input
          ref={docInput}
          type="file"
          hidden
          onChange={e => {
            const file = e.currentTarget.files?.[0]
            e.currentTarget.value = ""
            if (file) void onUploadDocument(file, uploadFolderId)
          }}
        />
      ) : null}
    </div>
  )
}
