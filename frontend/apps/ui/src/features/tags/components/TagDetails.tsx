import {Link, useNavigation} from "react-router-dom"
import {
  Anchor,
  Box,
  Breadcrumbs,
  Center,
  Group,
  Loader,
  LoadingOverlay,
  Paper,
  Stack,
  Table,
  Text
} from "@mantine/core"
import {useState} from "react"
import {useTranslation} from "react-i18next"

import Pagination from "@/components/Pagination"
import {PAGINATION_DEFAULT_ITEMS_PER_PAGES} from "@/cconstants"
import {getBlobViewerCategory} from "@/features/document/documentPreview"
import {useGetTagNodesQuery, useGetTagQuery} from "@/features/tags/apiSlice"
import type {ColoredTagType} from "@/types"
import {formatNodeDisplayTitle} from "@/utils"
import type {TFunction} from "i18next"

import EditButton from "./EditButton"
import {DeleteTagButton} from "./DeleteButton"
import {useAppSelector} from "@/app/hooks"
import {TAG_DELETE, TAG_UPDATE} from "@/scopes"
import {selectCurrentUser} from "@/slices/currentUser"
import type {User} from "@/types"
import {formatApiDateTime} from "@/utils/formatDateTime"

type TagDetailsArgs = {
  tagId: string
}

export default function TagDetails({tagId}: TagDetailsArgs) {
  const {t} = useTranslation()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGINATION_DEFAULT_ITEMS_PER_PAGES)

  const {data: tag, isLoading: tagLoading} = useGetTagQuery(tagId)
  const user = useAppSelector(selectCurrentUser) as User | null
  const scopes = user?.scopes ?? []
  const canUpdate = scopes.includes(TAG_UPDATE)
  const canDelete = scopes.includes(TAG_DELETE)
  const {data: nodesData, isLoading: nodesLoading} = useGetTagNodesQuery({
    tagId,
    page_number: page,
    page_size: pageSize
  })

  const isLoading = tagLoading || nodesLoading

  if (tagLoading || !tag) {
    return (
      <Box pos="relative">
        <LoadingOverlay
          visible={true}
          zIndex={1000}
          overlayProps={{radius: "sm", blur: 2}}
        />
        <Path tag={null} />
      </Box>
    )
  }

  const rows = nodesData?.items ?? []

  return (
    <Stack>
      <Group justify="space-between">
        <Path tag={tag} />
        {(canUpdate || canDelete) && (
          <Group>
            {canUpdate ? <EditButton tagId={tag.id} /> : null}
            {canDelete ? <DeleteTagButton tagId={tag.id} /> : null}
          </Group>
        )}
      </Group>

      <Paper withBorder p="sm" pos="relative">
        <LoadingOverlay visible={isLoading && rows.length > 0} />
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("common.table.columns.name")}</Table.Th>
              <Table.Th>{t("library.col_type")}</Table.Th>
              <Table.Th>{t("tags.details.col_updated")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(row => (
              <Table.Tr key={row.node_id}>
                <Table.Td>
                  <Anchor
                    component={Link}
                    to={openHref(row.ctype, row.node_id)}
                  >
                    {formatNodeDisplayTitle(row.title, row.ctype)}
                  </Anchor>
                </Table.Td>
                <Table.Td>
                  {resolveTypeLabel(row.ctype, row.title, t)}
                </Table.Td>
                <Table.Td>
                  {formatApiDateTime(row.updated_at)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {!isLoading && rows.length === 0 ? (
          <Center py="md">
            <Text c="dimmed">{t("tags.details.nodes_empty")}</Text>
          </Center>
        ) : null}
      </Paper>

      {nodesData && nodesData.num_pages > 1 ? (
        <Pagination
          pagination={{
            pageNumber: page,
            pageSize: pageSize,
            numPages: nodesData.num_pages
          }}
          onPageNumberChange={setPage}
          onPageSizeChange={value => {
            if (value) {
              setPageSize(parseInt(value))
              setPage(1)
            }
          }}
          lastPageSize={pageSize}
        />
      ) : null}
    </Stack>
  )
}

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

function Path({tag}: {tag: ColoredTagType | null}) {
  const {t} = useTranslation()
  const navigation = useNavigation()

  return (
    <Group>
      <Breadcrumbs>
        <Link to="/tags/">{t("tags.name")}</Link>
        {tag ? <Text fw={500}>{tag.name}</Text> : null}
      </Breadcrumbs>
      {navigation.state == "loading" && <Loader size={"sm"} />}
    </Group>
  )
}
