import {getBlobViewerCategory} from "@/features/document/documentPreview"
import type {FavoriteFolder, FavoriteRow} from "@/features/library/libraryApiSlice"
import {
  useCreateLibraryFavoriteFolderMutation,
  useDeleteLibraryFavoriteFolderMutation,
  useGetLibraryFavoriteFoldersQuery,
  useGetLibraryFavoritesQuery,
  useMoveLibraryFavoriteMspSectionMutation,
  useMoveLibraryFavoriteMutation,
  useRemoveLibraryFavoriteMspSectionMutation,
  useRemoveLibraryFavoriteMutation
} from "@/features/library/libraryApiSlice"
import {
  isMspSectionRow,
  libraryItemHref,
  libraryItemKey
} from "@/features/library/libraryItem"
import {formatNodeDisplayTitle} from "@/utils"
import {
  Accordion,
  ActionIcon,
  Anchor,
  Button,
  Group,
  Loader,
  Menu,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput
} from "@mantine/core"
import {useDisclosure} from "@mantine/hooks"
import {notifications} from "@mantine/notifications"
import {IconFolder, IconFolderPlus, IconTrash} from "@tabler/icons-react"
import type {TFunction} from "i18next"
import {useMemo, useState} from "react"
import {useTranslation} from "react-i18next"
import {Link} from "react-router-dom"

const LIBRARY_PANEL_SCROLL_HEIGHT = "calc(100dvh - 18rem)"

function resolveTypeLabel(ctype: string, title: string, t: TFunction): string {
  if (ctype !== "document") {
    return t(`library.ctype_${ctype}`, {defaultValue: ctype})
  }
  const cat = getBlobViewerCategory(title)
  return t(`library.filetype_${cat}`, {defaultValue: cat})
}

function FavoriteRowsTable({
  rows,
  folders,
  t,
  onRemove,
  onMove,
  removing
}: {
  rows: FavoriteRow[]
  folders: FavoriteFolder[]
  t: TFunction
  onRemove: (row: FavoriteRow) => Promise<void>
  onMove: (row: FavoriteRow, folderId: string | null) => Promise<void>
  removing: boolean
}) {
  if (rows.length === 0) {
    return (
      <Text c="dimmed" size="sm" py="sm">
        {t("library.favorites_empty_folder")}
      </Text>
    )
  }
  return (
    <Table striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{t("common.table.columns.name")}</Table.Th>
          <Table.Th>{t("library.col_type")}</Table.Th>
          <Table.Th>{t("library.col_actions")}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map(row => (
          <Table.Tr key={libraryItemKey(row)}>
            <Table.Td>
              <Anchor component={Link} to={libraryItemHref(row)}>
                {formatNodeDisplayTitle(row.title, row.ctype)}
              </Anchor>
              {row.in_trash ? (
                <Text size="xs" c="dimmed">
                  {t("library.in_trash")}
                </Text>
              ) : null}
            </Table.Td>
            <Table.Td>{resolveTypeLabel(row.ctype, row.title, t)}</Table.Td>
            <Table.Td>
              <Group gap="xs" wrap="nowrap">
                {folders.length > 0 ? (
                  <Menu shadow="md" width={220}>
                    <Menu.Target>
                      <Button size="xs" variant="light">
                        {t("library.favorites_move")}
                      </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item onClick={() => void onMove(row, null)}>
                        {t("library.favorites_unfiled")}
                      </Menu.Item>
                      {folders.map(folder => (
                        <Menu.Item
                          key={folder.id}
                          disabled={row.folder_id === folder.id}
                          onClick={() => void onMove(row, folder.id)}
                        >
                          {folder.title}
                        </Menu.Item>
                      ))}
                    </Menu.Dropdown>
                  </Menu>
                ) : null}
                <Button
                  size="xs"
                  variant="light"
                  color="red"
                  loading={removing}
                  onClick={() => void onRemove(row)}
                >
                  {t("library.remove_favorite")}
                </Button>
              </Group>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}

export default function FavoritesPanel() {
  const {t} = useTranslation()
  const {data, isLoading, isError} = useGetLibraryFavoritesQuery()
  const {data: foldersData, isLoading: foldersLoading} =
    useGetLibraryFavoriteFoldersQuery()
  const [remove, {isLoading: removingNode}] = useRemoveLibraryFavoriteMutation()
  const [removeSection, {isLoading: removingSection}] =
    useRemoveLibraryFavoriteMspSectionMutation()
  const [moveFav] = useMoveLibraryFavoriteMutation()
  const [moveSection] = useMoveLibraryFavoriteMspSectionMutation()
  const [createFolder, createState] = useCreateLibraryFavoriteFolderMutation()
  const [deleteFolder, deleteState] = useDeleteLibraryFavoriteFolderMutation()
  const [opened, {open, close}] = useDisclosure(false)
  const [folderTitle, setFolderTitle] = useState("")

  const folders = foldersData ?? []
  const rows = data ?? []

  const grouped = useMemo(() => {
    const byFolder = new Map<string, FavoriteRow[]>()
    const unfiled: FavoriteRow[] = []
    for (const row of rows) {
      if (row.folder_id) {
        const list = byFolder.get(row.folder_id) ?? []
        list.push(row)
        byFolder.set(row.folder_id, list)
      } else {
        unfiled.push(row)
      }
    }
    return {byFolder, unfiled}
  }, [rows])

  const removing = removingNode || removingSection

  const onRemove = async (row: FavoriteRow) => {
    try {
      if (isMspSectionRow(row) && row.msp_id && row.type_section_id) {
        await removeSection({
          mspId: row.msp_id,
          typeSectionId: row.type_section_id
        }).unwrap()
      } else {
        await remove(row.node_id).unwrap()
      }
      notifications.show({
        title: t("library.removed_favorite"),
        message: "",
        color: "green"
      })
    } catch {
      notifications.show({title: t("library.error"), message: "", color: "red"})
    }
  }

  const onMove = async (row: FavoriteRow, folderId: string | null) => {
    try {
      if (isMspSectionRow(row) && row.msp_id && row.type_section_id) {
        await moveSection({
          mspId: row.msp_id,
          typeSectionId: row.type_section_id,
          folderId
        }).unwrap()
      } else {
        await moveFav({nodeId: row.node_id, folderId}).unwrap()
      }
      notifications.show({
        title: t("library.favorites_moved"),
        message: "",
        color: "green"
      })
    } catch {
      notifications.show({title: t("library.error"), message: "", color: "red"})
    }
  }

  const onCreate = async () => {
    const title = folderTitle.trim()
    if (!title) {
      return
    }
    try {
      await createFolder({title}).unwrap()
      setFolderTitle("")
      close()
      notifications.show({
        title: t("library.favorites_folder_created"),
        message: "",
        color: "green"
      })
    } catch (err: unknown) {
      const status =
        err && typeof err === "object" && "status" in err
          ? (err as {status: number}).status
          : 0
      notifications.show({
        title: t("library.error"),
        message:
          status === 409
            ? t("library.favorites_folder_exists")
            : status === 400
              ? t("library.favorites_folder_limit")
              : "",
        color: "red"
      })
    }
  }

  if (isLoading || foldersLoading) {
    return <Loader />
  }
  if (isError) {
    return <Text c="red">{t("library.load_error")}</Text>
  }

  const accordionValues = [
    ...folders.map(folder => folder.id),
    "__unfiled"
  ]

  return (
    <Stack gap="sm">
      <Group>
        <Button
          leftSection={<IconFolderPlus size={16} />}
          onClick={open}
          size="sm"
        >
          {t("library.favorites_new_folder")}
        </Button>
      </Group>
      <ScrollArea
        type="scroll"
        offsetScrollbars
        scrollbarSize={10}
        h={LIBRARY_PANEL_SCROLL_HEIGHT}
      >
        {folders.length === 0 && rows.length === 0 ? (
          <Text c="dimmed">{t("library.empty_favorites")}</Text>
        ) : (
          <Accordion multiple defaultValue={accordionValues}>
            {folders.map(folder => (
              <Accordion.Item key={folder.id} value={folder.id}>
                <Accordion.Control icon={<IconFolder size={16} />}>
                  <Group justify="space-between" pr="sm" wrap="nowrap">
                    <Text fw={600}>{folder.title}</Text>
                    <Text size="sm" c="dimmed">
                      {(grouped.byFolder.get(folder.id) ?? []).length}
                    </Text>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Group justify="flex-end" mb="xs">
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      aria-label={t("common.delete")}
                      onClick={() => {
                        if (
                          window.confirm(
                            t("library.favorites_folder_delete_confirm")
                          )
                        ) {
                          void deleteFolder(folder.id)
                            .unwrap()
                            .then(() => {
                              notifications.show({
                                title: t("library.favorites_folder_deleted"),
                                message: "",
                                color: "green"
                              })
                            })
                            .catch(() => {
                              notifications.show({
                                title: t("library.error"),
                                message: "",
                                color: "red"
                              })
                            })
                        }
                      }}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                  <Paper withBorder p="sm">
                    <FavoriteRowsTable
                      rows={grouped.byFolder.get(folder.id) ?? []}
                      folders={folders}
                      t={t}
                      onRemove={onRemove}
                      onMove={onMove}
                      removing={removing}
                    />
                  </Paper>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
            <Accordion.Item value="__unfiled">
              <Accordion.Control>
                <Group justify="space-between" pr="sm">
                  <Text fw={600}>{t("library.favorites_unfiled")}</Text>
                  <Text size="sm" c="dimmed">
                    {grouped.unfiled.length}
                  </Text>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Paper withBorder p="sm">
                  {grouped.unfiled.length === 0 && folders.length > 0 ? (
                    <Text c="dimmed" size="sm">
                      {t("library.empty_favorites")}
                    </Text>
                  ) : (
                    <FavoriteRowsTable
                      rows={grouped.unfiled}
                      folders={folders}
                      t={t}
                      onRemove={onRemove}
                      onMove={onMove}
                      removing={removing}
                    />
                  )}
                </Paper>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        )}
      </ScrollArea>
      <Modal
        opened={opened}
        onClose={close}
        title={t("library.favorites_new_folder")}
      >
        <Stack>
          <TextInput
            label={t("library.favorites_folder_name")}
            value={folderTitle}
            onChange={e => setFolderTitle(e.currentTarget.value)}
            data-autofocus
            onKeyDown={e => {
              if (e.key === "Enter") {
                void onCreate()
              }
            }}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => void onCreate()}
              loading={createState.isLoading}
              disabled={!folderTitle.trim()}
            >
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
