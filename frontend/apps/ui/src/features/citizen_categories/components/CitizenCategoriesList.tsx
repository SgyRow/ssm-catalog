import {
  Anchor,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  ThemeIcon
} from "@mantine/core"
import {IconChevronRight, IconUsers} from "@tabler/icons-react"
import {useMemo} from "react"
import {Link} from "react-router-dom"
import {useTranslation} from "react-i18next"

import {
  CitizenCategoryRowActions
} from "@/features/citizen_categories/components/ManageCitizenCategories"
import {
  useGetCitizenCategoriesQuery,
  type CitizenCategory
} from "@/features/citizen_categories/citizenCategoriesApiSlice"

function CategoryList({
  categories,
  emptyMessage
}: {
  categories: CitizenCategory[]
  emptyMessage: string
}) {
  const {t} = useTranslation()

  if (categories.length === 0) {
    return (
      <Paper withBorder p="xl" radius="md">
        <Text c="dimmed" ta="center">
          {emptyMessage}
        </Text>
      </Paper>
    )
  }

  return (
    <Stack gap="sm">
      {categories.map(cat => (
        <Paper
          key={cat.id}
          withBorder
          p="sm"
          radius="md"
          shadow="xs"
          styles={{
            root: {
              transition: "background-color 120ms ease",
              "&:hover": {
                backgroundColor: "var(--mantine-color-default-hover)"
              }
            }
          }}
        >
          <Group wrap="nowrap" align="center" justify="space-between" gap="sm">
            <Anchor
              component={Link}
              to={`/citizen-categories/${cat.id}`}
              underline="never"
              c="var(--mantine-color-text)"
              display="block"
              style={{minWidth: 0, flex: 1}}
            >
            <Group wrap="nowrap" gap="md" justify="space-between">
              <Group wrap="nowrap" gap="md" style={{minWidth: 0}}>
                <ThemeIcon
                  variant="light"
                  color="blue"
                  size="lg"
                  radius="md"
                  aria-hidden
                >
                  <IconUsers size={20} stroke={1.5} />
                </ThemeIcon>
                <Stack gap={2} style={{minWidth: 0}}>
                  <Text fw={500} size="md" truncate="end">
                    {cat.name}
                  </Text>
                  {cat.description ? (
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {cat.description}
                    </Text>
                  ) : null}
                  <Text size="xs" c="dimmed">
                    {t("citizen_categories.folder_count", {
                      count: cat.folder_count
                    })}
                  </Text>
                </Stack>
              </Group>
              <IconChevronRight
                size={18}
                stroke={1.5}
                color="var(--mantine-color-dimmed)"
                style={{flexShrink: 0}}
                aria-hidden
              />
            </Group>
            </Anchor>
            <CitizenCategoryRowActions category={cat} />
          </Group>
        </Paper>
      ))}
    </Stack>
  )
}

export default function CitizenCategoriesList() {
  const {t} = useTranslation()
  const {data, isLoading, isError} = useGetCitizenCategoriesQuery()

  const categories = useMemo(
    () => (data ? [...data].sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: "base"})) : []),
    [data]
  )

  if (isLoading) {
    return <Loader p="md" />
  }

  if (isError) {
    return (
      <Text p="md" c="dimmed">
        {t("citizen_categories.load_error")}
      </Text>
    )
  }

  return (
    <CategoryList
      categories={categories}
      emptyMessage={t("citizen_categories.empty")}
    />
  )
}
