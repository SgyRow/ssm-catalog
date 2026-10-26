import {
  Anchor,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  ThemeIcon
} from "@mantine/core"
import {IconChevronRight, IconFolder} from "@tabler/icons-react"
import {Link} from "react-router-dom"
import {useTranslation} from "react-i18next"

import {useGetCitizenCategoryFoldersQuery} from "@/features/citizen_categories/citizenCategoriesApiSlice"

type Props = {
  categoryId: string
}

export default function CitizenCategoryFoldersList({categoryId}: Props) {
  const {t} = useTranslation()
  const {data, isLoading, isError} = useGetCitizenCategoryFoldersQuery(categoryId)

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

  const folders = data ?? []

  if (folders.length === 0) {
    return (
      <Paper withBorder p="xl" radius="md">
        <Text c="dimmed" ta="center">
          {t("citizen_categories.folders_empty")}
        </Text>
      </Paper>
    )
  }

  return (
    <Stack gap="sm">
      {folders.map(row => (
        <Paper
          key={row.node_id}
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
          <Anchor
            component={Link}
            to={`/portal/folder/${row.node_id}`}
            underline="never"
            c="var(--mantine-color-text)"
            display="block"
          >
            <Group wrap="nowrap" gap="md" justify="space-between">
              <Group wrap="nowrap" gap="md" style={{minWidth: 0}}>
                <ThemeIcon
                  variant="light"
                  color="yellow"
                  size="lg"
                  radius="md"
                  aria-hidden
                >
                  <IconFolder size={20} stroke={1.5} />
                </ThemeIcon>
                <Text fw={500} size="md" truncate="end">
                  {row.title}
                </Text>
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
        </Paper>
      ))}
    </Stack>
  )
}
