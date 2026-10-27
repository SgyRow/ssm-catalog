import {useGetCitizenCategoriesQuery} from "@/features/citizen_categories/citizenCategoriesApiSlice"
import type {AdvancedSearchArgs, MaterialKind} from "@/features/search/advancedApiSlice"
import {useGetTagsQuery} from "@/features/tags/apiSlice"
import {
  Button,
  Group,
  MultiSelect,
  Select,
  Stack,
  TextInput
} from "@mantine/core"
import {DatePickerInput, type DateValue} from "@mantine/dates"
import {IconSearch} from "@tabler/icons-react"
import {useEffect, useMemo, useState} from "react"
import {useTranslation} from "react-i18next"

type Args = {
  initialTitle?: string
  searching?: boolean
  onSearch: (args: AdvancedSearchArgs) => void
}

function toIsoDate(value: DateValue): string | undefined {
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

export default function AdvancedSearchPanel({
  initialTitle = "",
  searching,
  onSearch
}: Args) {
  const {t} = useTranslation()
  const [title, setTitle] = useState(initialTitle)
  const [entityType, setEntityType] = useState<string | null>("all")
  const [createdFrom, setCreatedFrom] = useState<DateValue>(null)
  const [createdTo, setCreatedTo] = useState<DateValue>(null)
  const [updatedFrom, setUpdatedFrom] = useState<DateValue>(null)
  const [updatedTo, setUpdatedTo] = useState<DateValue>(null)
  const [tagIds, setTagIds] = useState<string[]>([])
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [kinds, setKinds] = useState<string[]>([])

  useEffect(() => {
    setTitle(initialTitle)
  }, [initialTitle])

  const {data: tags} = useGetTagsQuery(undefined)
  const {data: categories} = useGetCitizenCategoriesQuery()

  const tagOptions = useMemo(
    () => (tags ?? []).map(tag => ({value: tag.id, label: tag.name})),
    [tags]
  )
  const categoryOptions = useMemo(
    () => (categories ?? []).map(c => ({value: c.id, label: c.name})),
    [categories]
  )
  const kindOptions = useMemo(
    () => [
      {value: "normative", label: t("search.kind.normative")},
      {value: "reference", label: t("search.kind.reference")},
      {value: "measure", label: t("search.kind.measure")},
      {value: "methodical", label: t("search.kind.methodical")},
      {value: "form", label: t("search.kind.form")}
    ],
    [t]
  )

  const submit = () => {
    onSearch({
      title: title.trim() || undefined,
      entity_type:
        entityType === "folder" || entityType === "document"
          ? entityType
          : undefined,
      created_from: toIsoDate(createdFrom),
      created_to: toIsoDate(createdTo),
      updated_from: toIsoDate(updatedFrom),
      updated_to: toIsoDate(updatedTo),
      tag_ids: tagIds,
      category_ids: categoryIds,
      kinds: kinds as MaterialKind[]
    })
  }

  return (
    <Stack gap="sm">
      <Group grow preventGrowOverflow={false} wrap="wrap" align="flex-end">
        <TextInput
          label={t("search.filter.name")}
          value={title}
          onChange={e => setTitle(e.currentTarget.value)}
          onKeyDown={e => {
            if (e.key === "Enter") submit()
          }}
        />
        <Select
          label={t("search.filter.entity_type")}
          value={entityType}
          allowDeselect={false}
          data={[
            {value: "all", label: t("search.filter.all")},
            {value: "folder", label: t("search.filter.folders")},
            {value: "document", label: t("search.filter.documents")}
          ]}
          onChange={setEntityType}
        />
        <MultiSelect
          label={t("search.filter.kind")}
          data={kindOptions}
          value={kinds}
          onChange={setKinds}
          searchable
        />
      </Group>
      <Group grow preventGrowOverflow={false} wrap="wrap">
        <DatePickerInput
          label={t("search.filter.created_from")}
          value={createdFrom}
          onChange={setCreatedFrom}
          valueFormat="DD.MM.YYYY"
          clearable
        />
        <DatePickerInput
          label={t("search.filter.created_to")}
          value={createdTo}
          onChange={setCreatedTo}
          valueFormat="DD.MM.YYYY"
          clearable
        />
        <DatePickerInput
          label={t("search.filter.updated_from")}
          value={updatedFrom}
          onChange={setUpdatedFrom}
          valueFormat="DD.MM.YYYY"
          clearable
        />
        <DatePickerInput
          label={t("search.filter.updated_to")}
          value={updatedTo}
          onChange={setUpdatedTo}
          valueFormat="DD.MM.YYYY"
          clearable
        />
      </Group>
      <Group grow preventGrowOverflow={false} wrap="wrap" align="flex-end">
        <MultiSelect
          label={t("search.filter.categories")}
          data={categoryOptions}
          value={categoryIds}
          onChange={setCategoryIds}
          searchable
        />
        <MultiSelect
          label={t("search.filter.tags")}
          data={tagOptions}
          value={tagIds}
          onChange={setTagIds}
          searchable
        />
        <Button
          leftSection={<IconSearch size={16} />}
          onClick={submit}
          loading={searching}
        >
          {t("search.advanced_submit")}
        </Button>
      </Group>
    </Stack>
  )
}
