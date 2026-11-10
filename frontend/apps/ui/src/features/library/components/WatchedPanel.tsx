import {getBlobViewerCategory} from "@/features/document/documentPreview"
import {
  useGetLibraryWatchedQuery,
  useRemoveLibraryWatchedMutation,
  type WatchedRow
} from "@/features/library/libraryApiSlice"
import {formatNodeDisplayTitle} from "@/utils"
import {
  Anchor,
  Button,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text
} from "@mantine/core"
import {notifications} from "@mantine/notifications"
import type {TFunction} from "i18next"
import {useTranslation} from "react-i18next"
import {Link} from "react-router-dom"

const LIBRARY_PANEL_SCROLL_HEIGHT = "calc(100dvh - 18rem)"

function openHref(ctype: string, id: string) {
  return ctype === "folder" ? `/folder/${id}` : `/document/${id}`
}

function resolveTypeLabel(ctype: string, title: string, t: TFunction): string {
  if (ctype !== "document") {
    return t(`library.ctype_${ctype}`, {defaultValue: ctype})
  }
  const cat = getBlobViewerCategory(title)
  return t(`library.filetype_${cat}`, {defaultValue: cat})
}

function WatchedRowsTable({
  rows,
  t,
  onRemove,
  removing
}: {
  rows: WatchedRow[]
  t: TFunction
  onRemove: (nodeId: string) => Promise<void>
  removing: boolean
}) {
  if (rows.length === 0) {
    return (
      <Text c="dimmed" size="sm" py="sm">
        {t("library.empty_watched")}
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
                onClick={() => void onRemove(row.node_id)}
              >
                {t("library.remove_watched")}
              </Button>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}

export default function WatchedPanel() {
  const {t} = useTranslation()
  const {data, isLoading, isError} = useGetLibraryWatchedQuery()
  const [remove, {isLoading: removing}] = useRemoveLibraryWatchedMutation()

  const rows = data ?? []

  const onRemove = async (nodeId: string) => {
    try {
      await remove(nodeId).unwrap()
      notifications.show({
        title: t("library.removed_watched"),
        message: "",
        color: "green"
      })
    } catch {
      notifications.show({title: t("library.error"), message: "", color: "red"})
    }
  }

  if (isLoading) {
    return <Loader />
  }
  if (isError) {
    return <Text c="red">{t("library.load_error")}</Text>
  }

  return (
    <Stack gap="sm">
      <ScrollArea
        type="scroll"
        offsetScrollbars
        scrollbarSize={10}
        h={LIBRARY_PANEL_SCROLL_HEIGHT}
      >
        <Paper withBorder p="sm">
          <WatchedRowsTable
            rows={rows}
            t={t}
            onRemove={onRemove}
            removing={removing}
          />
        </Paper>
      </ScrollArea>
    </Stack>
  )
}
