import AuditLogFilters, {
  toIsoDate,
  type AuditLogFilterValues
} from "@/features/audit/AuditLogFilters"
import {formatAuditDetail} from "@/features/audit/formatAuditDetail"
import {useGetLibraryAuditLogQuery} from "@/features/library/libraryApiSlice"
import {selectCurrentUser} from "@/slices/currentUser"
import type {UserDetails} from "@/types"
import {
  Loader,
  Pagination,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title
} from "@mantine/core"
import {useEffect, useMemo, useState} from "react"
import {useTranslation} from "react-i18next"
import {useSelector} from "react-redux"

import AccessForbidden from "@/pages/errors/AccessForbidden"
import {formatApiDateTime} from "@/utils/formatDateTime"

const EMPTY_FILTERS: AuditLogFilterValues = {
  action: null,
  resourceType: null,
  userId: null,
  q: "",
  createdFrom: null,
  createdTo: null
}

export default function AuditLogPage() {
  const {t} = useTranslation()
  const user = useSelector(selectCurrentUser) as UserDetails | null
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<AuditLogFilterValues>(EMPTY_FILTERS)
  const [debouncedQ, setDebouncedQ] = useState("")
  const pageSize = 50

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQ(filters.q.trim())
    }, 300)
    return () => window.clearTimeout(handle)
  }, [filters.q])

  const query = useMemo(
    () => ({
      page,
      page_size: pageSize,
      action: filters.action || undefined,
      resource_type: filters.resourceType || undefined,
      user_id: filters.userId || undefined,
      q: debouncedQ || undefined,
      created_from: toIsoDate(filters.createdFrom),
      created_to: toIsoDate(filters.createdTo)
    }),
    [
      page,
      filters.action,
      filters.resourceType,
      filters.userId,
      filters.createdFrom,
      filters.createdTo,
      debouncedQ
    ]
  )

  const {data, isLoading, isError, isFetching} = useGetLibraryAuditLogQuery(query, {
    skip: !user?.is_superuser
  })

  const applyFilters = (next: AuditLogFilterValues) => {
    setFilters(next)
    setPage(1)
    if (!next.q.trim()) {
      setDebouncedQ("")
    }
  }

  if (!user) {
    return <Loader />
  }

  if (!user.is_superuser) {
    return <AccessForbidden />
  }

  if (isLoading) {
    return <Loader />
  }

  if (isError || !data) {
    return <Text c="red">{t("audit_log.load_error")}</Text>
  }

  const rows = data.items ?? []
  const numPages = data.num_pages ?? 1
  const filtersActive = Boolean(
    filters.action ||
      filters.resourceType ||
      filters.userId ||
      debouncedQ ||
      filters.createdFrom ||
      filters.createdTo
  )

  return (
    <Stack p="md" gap="md">
      <Title order={3}>{t("audit_log.title")}</Title>
      <AuditLogFilters value={filters} onChange={applyFilters} />
      <ScrollArea
        type="scroll"
        offsetScrollbars
        scrollbarSize={10}
        h="calc(100dvh - 22rem)"
      >
        <Paper withBorder p="sm">
          <Table stickyHeader striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("audit_log.col_time")}</Table.Th>
                <Table.Th>{t("audit_log.col_user")}</Table.Th>
                <Table.Th>{t("audit_log.col_action")}</Table.Th>
                <Table.Th>{t("audit_log.col_resource_type")}</Table.Th>
                <Table.Th>{t("audit_log.col_resource_id")}</Table.Th>
                <Table.Th>{t("audit_log.col_detail")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(row => (
                <Table.Tr key={row.id}>
                  <Table.Td>{formatApiDateTime(row.created_at)}</Table.Td>
                  <Table.Td>
                    <Text size="sm" style={{wordBreak: "break-all"}}>
                      {row.username || row.user_id || "—"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {t(`audit_log.action.${row.action}`, {defaultValue: row.action})}
                  </Table.Td>
                  <Table.Td>
                    {t(`audit_log.resource_type.${row.resource_type}`, {
                      defaultValue: row.resource_type
                    })}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" style={{wordBreak: "break-all"}}>
                      {row.resource_id ?? "—"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" style={{wordBreak: "break-all"}}>
                      {formatAuditDetail(row.detail)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {rows.length === 0 ? (
            <Text c="dimmed" mt="sm">
              {filtersActive ? t("audit_log.empty_filtered") : t("audit_log.empty")}
            </Text>
          ) : null}
        </Paper>
      </ScrollArea>
      {numPages > 1 ? (
        <Pagination
          value={page}
          onChange={setPage}
          total={numPages}
          mt="sm"
          disabled={isFetching}
        />
      ) : null}
    </Stack>
  )
}
