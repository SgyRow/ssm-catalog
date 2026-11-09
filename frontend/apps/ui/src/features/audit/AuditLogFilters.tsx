import {
  AUDIT_ACTION_GROUPS,
  AUDIT_RESOURCE_TYPES
} from "@/features/audit/auditFilterOptions"
import {useGetUsersQuery} from "@/features/users/apiSlice"
import {displayName} from "@/utils/userDisplay"
import {Button, Group, Select, TextInput} from "@mantine/core"
import {DatePickerInput, type DateValue} from "@mantine/dates"
import {IconFilterOff, IconSearch} from "@tabler/icons-react"
import {useMemo} from "react"
import {useTranslation} from "react-i18next"

export type AuditLogFilterValues = {
  action: string | null
  resourceType: string | null
  userId: string | null
  q: string
  createdFrom: DateValue
  createdTo: DateValue
}

type Args = {
  value: AuditLogFilterValues
  onChange: (next: AuditLogFilterValues) => void
}

export default function AuditLogFilters({value, onChange}: Args) {
  const {t} = useTranslation()
  const {data: users} = useGetUsersQuery()

  const actionData = useMemo(
    () =>
      AUDIT_ACTION_GROUPS.map(group => ({
        group: t(`audit_log.filter.group.${group.groupKey}`),
        items: group.actions.map(action => ({
          value: action,
          label: t(`audit_log.action.${action}`, {defaultValue: action})
        }))
      })),
    [t]
  )

  const resourceData = useMemo(
    () =>
      AUDIT_RESOURCE_TYPES.map(type => ({
        value: type,
        label: t(`audit_log.resource_type.${type}`, {defaultValue: type})
      })),
    [t]
  )

  const userData = useMemo(
    () =>
      (users ?? [])
        .map(user => ({
          value: user.id,
          label: displayName(user)
        }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, {sensitivity: "base"})),
    [users]
  )

  const hasFilters =
    Boolean(value.action) ||
    Boolean(value.resourceType) ||
    Boolean(value.userId) ||
    Boolean(value.q.trim()) ||
    Boolean(value.createdFrom) ||
    Boolean(value.createdTo)

  return (
    <Group align="flex-end" gap="sm" wrap="wrap">
      <Select
        size="sm"
        w={260}
        searchable
        clearable
        label={t("audit_log.filter.action")}
        placeholder={t("audit_log.filter.all")}
        data={actionData}
        value={value.action}
        onChange={action => onChange({...value, action})}
      />
      <Select
        size="sm"
        w={200}
        searchable
        clearable
        label={t("audit_log.filter.resource_type")}
        placeholder={t("audit_log.filter.all")}
        data={resourceData}
        value={value.resourceType}
        onChange={resourceType => onChange({...value, resourceType})}
      />
      <Select
        size="sm"
        w={220}
        searchable
        clearable
        label={t("audit_log.filter.user")}
        placeholder={t("audit_log.filter.all")}
        data={userData}
        value={value.userId}
        onChange={userId => onChange({...value, userId})}
      />
      <DatePickerInput
        size="sm"
        w={160}
        clearable
        label={t("audit_log.filter.from")}
        value={value.createdFrom}
        onChange={createdFrom => onChange({...value, createdFrom})}
        valueFormat="DD.MM.YYYY"
        maxDate={value.createdTo instanceof Date ? value.createdTo : undefined}
      />
      <DatePickerInput
        size="sm"
        w={160}
        clearable
        label={t("audit_log.filter.to")}
        value={value.createdTo}
        onChange={createdTo => onChange({...value, createdTo})}
        valueFormat="DD.MM.YYYY"
        minDate={value.createdFrom instanceof Date ? value.createdFrom : undefined}
      />
      <TextInput
        size="sm"
        w={260}
        label={t("audit_log.filter.search")}
        placeholder={t("audit_log.filter.search_placeholder")}
        leftSection={<IconSearch size={16} />}
        value={value.q}
        onChange={e => onChange({...value, q: e.currentTarget.value})}
      />
      <Button
        size="sm"
        variant="subtle"
        leftSection={<IconFilterOff size={16} />}
        disabled={!hasFilters}
        onClick={() =>
          onChange({
            action: null,
            resourceType: null,
            userId: null,
            q: "",
            createdFrom: null,
            createdTo: null
          })
        }
      >
        {t("audit_log.filter.reset")}
      </Button>
    </Group>
  )
}

export function toIsoDate(value: DateValue): string | undefined {
  if (!value) {
    return undefined
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}
