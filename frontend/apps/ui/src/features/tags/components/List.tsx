import {useGetTagsQuery} from "@/features/tags/apiSlice"
import {
  filterUpdated,
  selectFilterText,
  selectionAdd,
  selectionRemove,
  selectSelectedIds
} from "@/features/tags/tagsSlice"
import {
  canManageTags,
  TAG_CREATE,
  TAG_DELETE,
  TAG_SELECT,
  TAG_UPDATE,
  TAG_VIEW
} from "@/scopes"
import {useAppSelector} from "@/app/hooks"
import {selectCurrentUser} from "@/slices/currentUser"
import type {ColoredTag, User} from "@/types"
import {
  Anchor,
  Center,
  Checkbox,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title
} from "@mantine/core"
import {useMemo} from "react"
import {useDispatch, useSelector} from "react-redux"
import {Link} from "react-router-dom"
import {useTranslation} from "react-i18next"

import ActionButtons from "./ActionButtons"

function canListTags(scopes: string[]): boolean {
  return (
    scopes.includes(TAG_VIEW) ||
    scopes.includes(TAG_SELECT) ||
    scopes.includes(TAG_CREATE) ||
    canManageTags(scopes)
  )
}

export default function TagsList() {
  const {t} = useTranslation()
  const dispatch = useDispatch()
  const filterText = useSelector(selectFilterText)
  const user = useAppSelector(selectCurrentUser) as User | null
  const scopes = user?.scopes ?? []
  const selectedIds = useSelector(selectSelectedIds)
  const canSelectForManage =
    scopes.includes(TAG_UPDATE) || scopes.includes(TAG_DELETE)

  const {data, isLoading, isFetching, isError} = useGetTagsQuery(undefined, {
    skip: !canListTags(scopes)
  })

  const tags = useMemo(() => {
    const byName = new Map<string, ColoredTag>()
    for (const tag of data ?? []) {
      const key = tag.name.toLowerCase()
      if (!byName.has(key)) {
        byName.set(key, tag)
      }
    }
    const items = [...byName.values()]
    const needle = (filterText ?? "").trim().toLowerCase()
    if (!needle) {
      return [...items].sort((a, b) => a.name.localeCompare(b.name))
    }
    return items
      .filter(
        tag =>
          tag.name.toLowerCase().includes(needle) ||
          (tag.description ?? "").toLowerCase().includes(needle)
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [data, filterText])

  const onQuickFilterChange = (value: string) => {
    dispatch(filterUpdated(value))
  }

  const onQuickFilterClear = () => {
    dispatch(filterUpdated(undefined))
  }

  if (!canListTags(scopes)) {
    return (
      <Center py="xl">
        <Text c="dimmed">{t("tags.list.no_access")}</Text>
      </Center>
    )
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Title order={3}>{t("tags.name")}</Title>
        <ActionButtons
          isFetching={isFetching}
          onQuickFilterChange={onQuickFilterChange}
          onQuickFilterClear={onQuickFilterClear}
        />
      </Group>

      {isLoading ? (
        <Center py="xl">
          <Loader type="bars" />
        </Center>
      ) : isError ? (
        <Center py="xl">
          <Text c="red">{t("tags.list.load_error")}</Text>
        </Center>
      ) : tags.length === 0 ? (
        <Empty hasFilter={Boolean(filterText)} />
      ) : (
        <Paper withBorder p="md">
          <SimpleGrid cols={{base: 1, xs: 2, sm: 3, md: 4}} spacing="sm">
            {tags.map(tag => (
              <TagCard
                key={tag.id}
                tag={tag}
                selectable={canSelectForManage}
                selected={selectedIds.includes(tag.id)}
                onToggleSelect={checked => {
                  if (checked) {
                    dispatch(selectionAdd(tag.id))
                  } else {
                    dispatch(selectionRemove(tag.id))
                  }
                }}
              />
            ))}
          </SimpleGrid>
        </Paper>
      )}
    </Stack>
  )
}

function TagCard({
  tag,
  selectable,
  selected,
  onToggleSelect
}: {
  tag: ColoredTag
  selectable: boolean
  selected: boolean
  onToggleSelect: (checked: boolean) => void
}) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        {selectable ? (
          <Checkbox
            checked={selected}
            onChange={e => onToggleSelect(e.currentTarget.checked)}
            mt={2}
          />
        ) : null}
        <Anchor
          component={Link}
          to={`/tags/${tag.id}`}
          underline="never"
          style={{flex: 1}}
        >
          <Text fw={500}>{tag.name}</Text>
          {tag.description ? (
            <Text size="xs" c="dimmed" lineClamp={2} mt={4}>
              {tag.description}
            </Text>
          ) : null}
        </Anchor>
      </Group>
    </Paper>
  )
}

function Empty({hasFilter}: {hasFilter: boolean}) {
  const {t} = useTranslation()
  return (
    <Center py="xl">
      <Stack align="center" gap="xs">
        <Text c="dimmed">
          {hasFilter ? t("tags.list.empty_filter") : t("tags.list.empty")}
        </Text>
        {!hasFilter ? (
          <Text size="sm" c="dimmed" ta="center" maw={420}>
            {t("tags.list.empty_hint")}
          </Text>
        ) : null}
      </Stack>
    </Center>
  )
}
