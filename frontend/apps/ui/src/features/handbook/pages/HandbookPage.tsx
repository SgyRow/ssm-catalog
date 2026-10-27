import classes from "@/components/ViewportPage.module.css"
import cardClasses from "@/features/handbook/Handbook.module.css"
import {
  useCreateHandbookArticleMutation,
  useDeleteHandbookArticleMutation,
  useGetHandbookArticlesQuery
} from "@/features/handbook/handbookApiSlice"
import {PORTAL_FEED_MANAGE} from "@/scopes"
import {selectCurrentUser} from "@/slices/currentUser"
import type {UserDetails} from "@/types"
import {formatApiDateTimeCompact} from "@/utils/formatDateTime"
import {Button, Group, Loader, Stack, Text, Title} from "@mantine/core"
import {IconPlus, IconTrash} from "@tabler/icons-react"
import {useSelector} from "react-redux"
import {Link, useNavigate} from "react-router-dom"
import {useTranslation} from "react-i18next"

export default function HandbookPage() {
  const {t} = useTranslation()
  const navigate = useNavigate()
  const user = useSelector(selectCurrentUser) as UserDetails | null
  const canManage =
    Boolean(user?.is_superuser) ||
    (user?.scopes ?? []).includes(PORTAL_FEED_MANAGE)
  const {data, isLoading, error} = useGetHandbookArticlesQuery()
  const [createArticle, {isLoading: creating}] =
    useCreateHandbookArticleMutation()
  const [deleteArticle] = useDeleteHandbookArticleMutation()

  const onCreate = async () => {
    const created = await createArticle({
      title: t("handbook.new_title"),
      body: ""
    }).unwrap()
    navigate(`/handbook/${created.id}`)
  }

  if (isLoading) {
    return <Loader />
  }

  if (error) {
    return (
      <Text p="md" c="red">
        {t("handbook.load_error")}
      </Text>
    )
  }

  const rows = data ?? []

  return (
    <div className={classes.page}>
      <Stack className={classes.scroll} p="md" gap="md">
        <Group justify="space-between" align="center">
          <Title order={3}>{t("handbook.title")}</Title>
          {canManage ? (
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => void onCreate()}
              loading={creating}
            >
              {t("handbook.create")}
            </Button>
          ) : null}
        </Group>
        {rows.length === 0 ? (
          <Text c="dimmed">{t("handbook.empty")}</Text>
        ) : (
          <Stack gap="sm">
            {rows.map(item => (
              <Group
                key={item.id}
                justify="space-between"
                wrap="nowrap"
                align="flex-start"
              >
                <Link
                  className={cardClasses.card}
                  to={`/handbook/${item.id}`}
                  style={{flex: 1}}
                >
                  <Text fw={650}>{item.title}</Text>
                  <Text size="sm" c="dimmed">
                    {formatApiDateTimeCompact(item.updated_at)}
                    {item.author_username
                      ? ` · ${item.author_username}`
                      : ""}
                  </Text>
                </Link>
                {canManage ? (
                  <Button
                    variant="subtle"
                    color="red"
                    size="compact-sm"
                    leftSection={<IconTrash size={14} />}
                    onClick={() => void deleteArticle(item.id)}
                  >
                    {t("common.delete")}
                  </Button>
                ) : null}
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </div>
  )
}
