import {useAppSelector} from "@/app/hooks"
import {getBlobViewerCategory} from "@/features/document/documentPreview"
import type {TFunction} from "i18next"
import {
  useGetLibraryFavoritesQuery,
  useGetLibraryRecentQuery,
  useGetLibraryTrashQuery,
  useGetLibrarySettingsQuery,
  usePurgeLibraryTrashMutation,
  useRemoveLibraryFavoriteMutation,
  useRestoreLibraryTrashMutation,
  useUpdateLibrarySettingsMutation
} from "@/features/library/libraryApiSlice"
import {NODE_DELETE, NODE_UPDATE, NODE_VIEW} from "@/scopes"
import {selectCurrentUser} from "@/slices/currentUser"
import type {User} from "@/types"
import {formatApiDateTime} from "@/utils/formatDateTime"
import {formatNodeDisplayTitle} from "@/utils"
import {
  Anchor,
  Button,
  Checkbox,
  Group,
  Loader,
  NumberInput,
  Pagination,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Tabs,
  Text,
  Title
} from "@mantine/core"
import {notifications} from "@mantine/notifications"
import {IconHistory, IconStar, IconTrash} from "@tabler/icons-react"
import {type ReactNode, useEffect, useMemo, useState} from "react"
import {useTranslation} from "react-i18next"
import {Link, useNavigate, useParams} from "react-router-dom"

type Section = "favorites" | "recent" | "trash"

const valid = (s: string | undefined): Section => {
  const v = (s || "favorites") as Section
  if (v === "recent" || v === "trash" || v === "favorites") {
    return v
  }
  return "favorites"
}

export default function LibraryPage() {
  const {t} = useTranslation()
  const {section} = useParams<{section?: string}>()
  const tab = valid(section)
  const navigate = useNavigate()
  const user = useAppSelector(selectCurrentUser) as User | null
  const scopes = user?.scopes ?? []

  const onTabChange = (v: string | null) => {
    if (v) navigate(`/library/${v}`)
  }

  return (
    <Stack p="md" gap="md">
      <Title order={3}>{t("library.title")}</Title>
      <Tabs value={tab} onChange={onTabChange}>
        <Tabs.List>
          <Tabs.Tab
            value="favorites"
            leftSection={<IconStar size={16} />}
            disabled={!scopes.includes(NODE_VIEW)}
          >
            {t("library.tab_favorites")}
          </Tabs.Tab>
          <Tabs.Tab
            value="recent"
            leftSection={<IconHistory size={16} />}
            disabled={!scopes.includes(NODE_VIEW)}
          >
            {t("library.tab_recent")}
          </Tabs.Tab>
          <Tabs.Tab
            value="trash"
            leftSection={<IconTrash size={16} />}
            disabled={!scopes.includes(NODE_VIEW)}
          >
            {t("library.tab_trash")}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="favorites" pt="md">
          {scopes.includes(NODE_VIEW) ? <FavoritesPanel /> : null}
        </Tabs.Panel>
        <Tabs.Panel value="recent" pt="md">
          {scopes.includes(NODE_VIEW) ? <RecentPanel /> : null}
        </Tabs.Panel>
        <Tabs.Panel value="trash" pt="md">
          {scopes.includes(NODE_VIEW) ? <TrashPanel /> : null}
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}

const LIBRARY_PANEL_SCROLL_HEIGHT = "calc(100dvh - 18rem)"
const LIBRARY_TRASH_SCROLL_HEIGHT = "calc(100dvh - 22rem)"

function LibraryPanelScroll({
  children,
  height = LIBRARY_PANEL_SCROLL_HEIGHT
}: {
  children: ReactNode
  height?: string
}) {
  return (
    <ScrollArea
      type="scroll"
      offsetScrollbars
      scrollbarSize={10}
      h={height}
    >
      {children}
    </ScrollArea>
  )
}

function openHref(ctype: string, id: string) {
  return ctype === "folder" ? `/folder/${id}` : `/document/${id}`
}

function resolveTypeLabel(ctype: string, title: string, t: TFunction): string {
  if (ctype !== "document") {
    return t(`library.ctype_${ctype}`, {defaultValue: ctype})
  }
  // Files without a recognized extension fall back to category "binary", displayed as "File"
  const cat = getBlobViewerCategory(title)
  return t(`library.filetype_${cat}`, {defaultValue: cat})
}

function FavoritesPanel() {
  const {t} = useTranslation()
  const {data, isLoading, isError} = useGetLibraryFavoritesQuery()
  const [remove, {isLoading: removing}] = useRemoveLibraryFavoriteMutation()

  if (isLoading) {
    return <Loader />
  }
  if (isError) {
    return <Text c="red">{t("library.load_error")}</Text>
  }
  const rows = data ?? []
  return (
    <LibraryPanelScroll>
      <Paper withBorder p="sm">
        <Table stickyHeader striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("common.table.columns.name")}</Table.Th>
              <Table.Th>{t("library.col_type")}</Table.Th>
              <Table.Th>{t("library.col_actions")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(row => (
              <Table.Tr key={row.node_id}>
                <Table.Td>
                  <Anchor component={Link} to={openHref(row.ctype, row.node_id)}>
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
                  <Button
                    size="xs"
                    variant="light"
                    color="red"
                    loading={removing}
                    onClick={async () => {
                      try {
                        await remove(row.node_id).unwrap()
                        notifications.show({
                          title: t("library.removed_favorite"),
                          message: "",
                          color: "green"
                        })
                      } catch {
                        notifications.show({
                          title: t("library.error"),
                          message: "",
                          color: "red"
                        })
                      }
                    }}
                  >
                    {t("library.remove_favorite")}
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {rows.length === 0 ? (
          <Text c="dimmed" mt="sm">
            {t("library.empty_favorites")}
          </Text>
        ) : null}
      </Paper>
    </LibraryPanelScroll>
  )
}

function RecentPanel() {
  const {t} = useTranslation()
  const {data, isLoading, isError} = useGetLibraryRecentQuery()

  if (isLoading) {
    return <Loader />
  }
  if (isError) {
    return <Text c="red">{t("library.load_error")}</Text>
  }
  const rows = data ?? []
  return (
    <LibraryPanelScroll>
      <Paper withBorder p="sm">
        <Table stickyHeader striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("common.table.columns.name")}</Table.Th>
              <Table.Th>{t("library.col_type")}</Table.Th>
              <Table.Th>{t("library.col_viewed")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(row => (
              <Table.Tr key={`${row.node_id}-${row.viewed_at}`}>
                <Table.Td>
                  <Anchor component={Link} to={openHref(row.ctype, row.node_id)}>
                    {formatNodeDisplayTitle(row.title, row.ctype)}
                  </Anchor>
                </Table.Td>
                <Table.Td>{resolveTypeLabel(row.ctype, row.title, t)}</Table.Td>
                <Table.Td>{formatApiDateTime(row.viewed_at)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {rows.length === 0 ? (
          <Text c="dimmed" mt="sm">
            {t("library.empty_recent")}
          </Text>
        ) : null}
      </Paper>
    </LibraryPanelScroll>
  )
}

function TrashPanel() {
  const {t} = useTranslation()
  const user = useAppSelector(selectCurrentUser) as User | null
  const scopes = user?.scopes ?? []
  const isSuperuser = Boolean(user?.is_superuser)
  const [page, setPage] = useState(1)
  const {data, isLoading, isError} = useGetLibraryTrashQuery({
    page_number: page,
    page_size: 20
  })
  const [restore, {isLoading: restoring}] = useRestoreLibraryTrashMutation()
  const [purge, {isLoading: purging}] = usePurgeLibraryTrashMutation()
  const {data: librarySettings} = useGetLibrarySettingsQuery()
  const [updateSettings, {isLoading: savingRetention}] =
    useUpdateLibrarySettingsMutation()
  const [retentionDays, setRetentionDays] = useState<number | string>(30)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (librarySettings?.trash_retention_days != null) {
      setRetentionDays(librarySettings.trash_retention_days)
    }
  }, [librarySettings?.trash_retention_days])

  const handleSaveRetention = async () => {
    const value =
      typeof retentionDays === "string"
        ? parseInt(retentionDays, 10)
        : retentionDays
    if (!Number.isFinite(value) || value < 1) {
      notifications.show({
        title: t("library.error"),
        message: t("library.trash_retention_invalid"),
        color: "red"
      })
      return
    }
    try {
      await updateSettings({trash_retention_days: value}).unwrap()
      notifications.show({
        title: t("library.trash_retention_saved"),
        message: "",
        color: "green"
      })
    } catch {
      notifications.show({
        title: t("library.error"),
        message: "",
        color: "red"
      })
    }
  }

  const items = data?.items ?? []
  const numPages = data?.num_pages ?? 1

  const toggle = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) {
        n.delete(id)
      } else {
        n.add(id)
      }
      return n
    })
  }

  const toggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(items.map(i => i.id)))
    }
  }

  const selectedIds = useMemo(() => Array.from(selected), [selected])

  if (isLoading) {
    return <Loader />
  }
  if (isError) {
    return <Text c="red">{t("library.load_error")}</Text>
  }

  return (
    <Stack>
      {isSuperuser ? (
        <Paper withBorder p="sm">
          <Stack gap="xs">
            <Text size="sm" c="dimmed">
              {t("library.trash_retention_help")}
            </Text>
            <Group align="flex-end" wrap="wrap">
              <NumberInput
                label={t("library.trash_retention_label")}
                description={t("library.trash_retention_description")}
                min={1}
                max={3650}
                value={retentionDays}
                onChange={setRetentionDays}
                suffix={t("library.trash_retention_suffix")}
                maw={220}
              />
              <Button loading={savingRetention} onClick={handleSaveRetention}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </Paper>
      ) : librarySettings ? (
        <Text size="sm" c="dimmed">
          {t("library.trash_retention_hint", {
            days: librarySettings.trash_retention_days
          })}
        </Text>
      ) : null}
      <Group>
        <Button
          size="sm"
          disabled={
            selectedIds.length === 0 ||
            !scopes.includes(NODE_UPDATE) ||
            restoring
          }
          loading={restoring}
          onClick={async () => {
            try {
              await restore({node_ids: selectedIds}).unwrap()
              setSelected(new Set())
              notifications.show({
                title: t("library.restored"),
                message: "",
                color: "green"
              })
            } catch {
              notifications.show({
                title: t("library.error"),
                message: "",
                color: "red"
              })
            }
          }}
        >
          {t("library.restore")}
        </Button>
        <Button
          size="sm"
          color="red"
          disabled={
            selectedIds.length === 0 || !scopes.includes(NODE_DELETE) || purging
          }
          loading={purging}
          onClick={async () => {
            try {
              await purge({node_ids: selectedIds}).unwrap()
              setSelected(new Set())
              notifications.show({
                title: t("library.purged"),
                message: "",
                color: "green"
              })
            } catch {
              notifications.show({
                title: t("library.error"),
                message: "",
                color: "red"
              })
            }
          }}
        >
          {t("library.purge_forever")}
        </Button>
      </Group>
      <LibraryPanelScroll height={LIBRARY_TRASH_SCROLL_HEIGHT}>
        <Paper withBorder p="sm">
          <Table stickyHeader striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>
                  <Checkbox
                    checked={items.length > 0 && selected.size === items.length}
                    indeterminate={
                      selected.size > 0 && selected.size < items.length
                    }
                    onChange={toggleAll}
                  />
                </Table.Th>
                <Table.Th>{t("common.table.columns.name")}</Table.Th>
                <Table.Th>{t("library.col_type")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map(node => (
                <Table.Tr key={node.id}>
                  <Table.Td>
                    <Checkbox
                      checked={selected.has(node.id)}
                      onChange={() => toggle(node.id)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Anchor component={Link} to={openHref(node.ctype, node.id)}>
                      {formatNodeDisplayTitle(node.title, node.ctype)}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    {resolveTypeLabel(node.ctype, node.title, t)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {items.length === 0 ? (
            <Text c="dimmed" mt="sm">
              {t("library.empty_trash")}
            </Text>
          ) : null}
        </Paper>
      </LibraryPanelScroll>
      {numPages > 1 ? (
        <Pagination value={page} onChange={setPage} total={numPages} mt="sm" />
      ) : null}
    </Stack>
  )
}
