import NormativeLinkPickerModal from "@/features/msp/NormativeLinkPickerModal"
import {
  useCreateMspNormativeFolderMutation,
  useCreateMspNormativeLinkMutation,
  useDeleteMspNormativeFolderMutation,
  useDeleteMspNormativeLinkMutation,
  useGetNormativeRegistryQuery,
  useListMspNormativeFoldersQuery,
  useUpdateMspNormativeFolderMutation,
  type MspNormativeFolder,
  type MspNormativeLink
} from "@/features/msp/mspApiSlice"
import LibraryBookmarkButtons from "@/features/library/components/LibraryBookmarkButtons"
import {formatNodeDisplayTitle} from "@/utils"
import type {NodeType} from "@/types"
import {
  Accordion,
  ActionIcon,
  Anchor,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
  ThemeIcon
} from "@mantine/core"
import {notifications} from "@mantine/notifications"
import {
  IconFile,
  IconFolder,
  IconFolderPlus,
  IconLink,
  IconPencil,
  IconTrash
} from "@tabler/icons-react"
import {useMemo, useState} from "react"
import {Link} from "react-router-dom"
import {useTranslation} from "react-i18next"

import classes from "./MspView.module.css"

type ChildNav = {
  to: string
  state?: unknown
}

type Props = {
  mspId: string
  /** Physical "Нормативные правовые документы" folder under the measure. */
  folderNode?: NodeType
  childNav?: (node: NodeType) => ChildNav
  canEdit?: boolean
}

function LinkRow({
  link,
  childNav,
  canEdit,
  onUnlink,
  unlinking
}: {
  link: MspNormativeLink
  childNav?: (node: NodeType) => ChildNav
  canEdit?: boolean
  onUnlink?: () => void
  unlinking?: boolean
}) {
  const {t} = useTranslation()
  const nav = childNav?.({
    id: link.document_id,
    ctype: "document",
    title: link.title
  } as NodeType) ?? {to: `/document/${link.document_id}`}
  const titleBlock = (
    <Group wrap="nowrap" gap="md" align="center" style={{flex: 1, minWidth: 0}}>
      <ThemeIcon
        variant="light"
        color="gray"
        size="lg"
        radius="md"
        aria-hidden
        style={{flexShrink: 0}}
      >
        <IconFile size={20} stroke={1.5} />
      </ThemeIcon>
      <div className={classes.nodeTitleWrap}>
        <Text fw={600} size="md" className={classes.nodeTitle}>
          {formatNodeDisplayTitle(link.title, "document")}
        </Text>
      </div>
    </Group>
  )

  return (
    <Paper withBorder p="md" radius="md">
      <Group wrap="nowrap" gap="md" justify="space-between" align="center">
        <Anchor
          component={Link}
          to={nav.to}
          state={nav.state}
          underline="never"
          c="var(--mantine-color-text)"
          style={{flex: 1, minWidth: 0}}
        >
          {titleBlock}
        </Anchor>
        <Group gap="xs" wrap="nowrap" style={{flexShrink: 0}}>
          <LibraryBookmarkButtons nodeId={link.document_id} size="sm" />
          {canEdit ? (
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={t("msp.normative.unlink")}
              loading={unlinking}
              onClick={e => {
                e.preventDefault()
                e.stopPropagation()
                onUnlink?.()
              }}
            >
              <IconTrash size={16} stroke={1.5} />
            </ActionIcon>
          ) : null}
        </Group>
      </Group>
    </Paper>
  )
}

export default function MspNormativeSection({
  mspId,
  folderNode,
  childNav,
  canEdit = false
}: Props) {
  const {t} = useTranslation()
  const {data: folders = [], isLoading} = useListMspNormativeFoldersQuery(mspId)
  const {data: registry} = useGetNormativeRegistryQuery(undefined, {
    skip: !canEdit
  })
  const [createFolder, {isLoading: creatingFolder}] =
    useCreateMspNormativeFolderMutation()
  const [updateFolder, {isLoading: renamingFolder}] =
    useUpdateMspNormativeFolderMutation()
  const [deleteFolder, {isLoading: deletingFolder}] =
    useDeleteMspNormativeFolderMutation()
  const [createLink, {isLoading: linking}] = useCreateMspNormativeLinkMutation()
  const [deleteLink, {isLoading: unlinking}] =
    useDeleteMspNormativeLinkMutation()

  const [pickerFolder, setPickerFolder] = useState<MspNormativeFolder | null>(
    null
  )
  const [folderModal, setFolderModal] = useState<
    | {mode: "create"}
    | {mode: "rename"; folder: MspNormativeFolder}
    | null
  >(null)
  const [folderTitleDraft, setFolderTitleDraft] = useState("")

  const excludeIds = useMemo(() => {
    const ids = new Set<string>()
    for (const folder of folders) {
      for (const link of folder.links) {
        ids.add(link.document_id)
      }
    }
    return ids
  }, [folders])

  const openCreateFolder = () => {
    setFolderTitleDraft("")
    setFolderModal({mode: "create"})
  }

  const openRenameFolder = (folder: MspNormativeFolder) => {
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
        await createFolder({msp_id: mspId, title}).unwrap()
        notifications.show({
          color: "green",
          message: t("msp.normative.folder_created")
        })
      } else {
        await updateFolder({
          msp_id: mspId,
          folder_id: folderModal.folder.id,
          title
        }).unwrap()
        notifications.show({
          color: "green",
          message: t("msp.normative.folder_renamed")
        })
      }
      setFolderModal(null)
    } catch {
      notifications.show({
        color: "red",
        message: t("msp.normative.folder_save_error")
      })
    }
  }

  const onDeleteFolder = async (folder: MspNormativeFolder) => {
    if (
      !window.confirm(
        t("msp.normative.folder_delete_confirm", {title: folder.title})
      )
    ) {
      return
    }
    try {
      await deleteFolder({
        msp_id: mspId,
        folder_id: folder.id
      }).unwrap()
      notifications.show({
        color: "green",
        message: t("msp.normative.folder_deleted")
      })
    } catch {
      notifications.show({
        color: "red",
        message: t("msp.normative.folder_delete_error")
      })
    }
  }

  const onAttach = async (document: {id: string; title: string}) => {
    if (!pickerFolder) {
      return
    }
    try {
      await createLink({
        msp_id: mspId,
        document_id: document.id,
        folder_id: pickerFolder.id
      }).unwrap()
      notifications.show({
        color: "green",
        message: t("msp.normative.attached")
      })
    } catch {
      notifications.show({
        color: "red",
        message: t("msp.normative.attach_error")
      })
    }
  }

  const onUnlink = async (linkId: string) => {
    try {
      await deleteLink({msp_id: mspId, link_id: linkId}).unwrap()
      notifications.show({
        color: "green",
        message: t("msp.normative.unlinked")
      })
    } catch {
      notifications.show({
        color: "red",
        message: t("msp.normative.unlink_error")
      })
    }
  }

  const sectionTitle =
    folderNode?.title ?? t("msp.normative.section_title")

  return (
    <>
      <Accordion chevronPosition="left" variant="separated" defaultValue={null}>
        <Accordion.Item value="normative">
          <div className={classes.sectionHead}>
            <Accordion.Control>
              <Group gap="sm" wrap="nowrap">
                <ThemeIcon
                  variant="light"
                  color="yellow"
                  size="md"
                  radius="md"
                  aria-hidden
                >
                  <IconFolder size={18} stroke={1.5} />
                </ThemeIcon>
                <Text size="sm" fw={600}>
                  {sectionTitle}
                </Text>
              </Group>
            </Accordion.Control>
            <div className={classes.sectionActions}>
              <Group gap="xs" wrap="nowrap">
                {canEdit ? (
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconFolderPlus size={14} />}
                    loading={creatingFolder}
                    onClick={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      openCreateFolder()
                    }}
                  >
                    {t("msp.normative.add_folder")}
                  </Button>
                ) : null}
                {folderNode ? (
                  <LibraryBookmarkButtons nodeId={folderNode.id} size="sm" />
                ) : null}
              </Group>
            </div>
          </div>
          <Accordion.Panel>
            {isLoading ? (
              <Loader size="sm" my="xs" />
            ) : folders.length === 0 ? (
              <Text size="xs" c="dimmed">
                {t("msp.view.folder_empty")}
              </Text>
            ) : (
              <Accordion
                multiple
                chevronPosition="left"
                variant="separated"
                defaultValue={[]}
              >
                {folders.map(folder => (
                  <Accordion.Item key={folder.id} value={folder.id}>
                    <div className={classes.sectionHead}>
                      <Accordion.Control>
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
                        </Group>
                      </Accordion.Control>
                      {canEdit ? (
                        <div className={classes.sectionActions}>
                          <Group gap={4} wrap="nowrap">
                            <Button
                              size="xs"
                              variant="light"
                              leftSection={<IconLink size={14} />}
                              loading={
                                linking && pickerFolder?.id === folder.id
                              }
                              onClick={e => {
                                e.preventDefault()
                                e.stopPropagation()
                                setPickerFolder(folder)
                              }}
                            >
                              {t("msp.normative.attach")}
                            </Button>
                            <ActionIcon
                              variant="subtle"
                              aria-label={t("msp.normative.rename_folder")}
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
                              aria-label={t("msp.normative.delete_folder")}
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
                        </div>
                      ) : null}
                    </div>
                    <Accordion.Panel>
                      {folder.links.length === 0 ? (
                        <Text size="xs" c="dimmed">
                          {t("msp.view.folder_empty")}
                        </Text>
                      ) : (
                        <Stack gap="xs">
                          {folder.links.map(link => (
                            <LinkRow
                              key={link.id}
                              link={link}
                              childNav={childNav}
                              canEdit={canEdit}
                              unlinking={unlinking}
                              onUnlink={() => void onUnlink(link.id)}
                            />
                          ))}
                        </Stack>
                      )}
                    </Accordion.Panel>
                  </Accordion.Item>
                ))}
              </Accordion>
            )}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <Modal
        opened={folderModal !== null}
        onClose={() => setFolderModal(null)}
        title={
          folderModal?.mode === "rename"
            ? t("msp.normative.rename_folder")
            : t("msp.normative.add_folder")
        }
      >
        <Stack gap="sm">
          <TextInput
            label={t("msp.normative.folder_title")}
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

      {canEdit && registry && pickerFolder ? (
        <NormativeLinkPickerModal
          opened={pickerFolder !== null}
          onClose={() => setPickerFolder(null)}
          registry={registry}
          bucketTitle={pickerFolder.title}
          excludeDocumentIds={excludeIds}
          onPick={doc => void onAttach(doc)}
        />
      ) : null}
    </>
  )
}
