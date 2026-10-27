import classes from "@/components/ViewportPage.module.css"
import articleClasses from "@/features/handbook/Handbook.module.css"
import HandbookEditor from "@/features/handbook/components/HandbookEditor"
import {
  useGetHandbookArticleQuery,
  useUpdateHandbookArticleMutation
} from "@/features/handbook/handbookApiSlice"
import {PORTAL_FEED_MANAGE} from "@/scopes"
import {selectCurrentUser} from "@/slices/currentUser"
import type {UserDetails} from "@/types"
import {formatApiDateTimeCompact} from "@/utils/formatDateTime"
import {Anchor, Button, Group, Loader, Stack, Text, TextInput, Title} from "@mantine/core"
import {useEffect, useState} from "react"
import {useSelector} from "react-redux"
import {Link, useParams} from "react-router-dom"
import {useTranslation} from "react-i18next"

export default function HandbookArticlePage() {
  const {t} = useTranslation()
  const {articleId} = useParams<{articleId: string}>()
  const user = useSelector(selectCurrentUser) as UserDetails | null
  const canManage =
    Boolean(user?.is_superuser) ||
    (user?.scopes ?? []).includes(PORTAL_FEED_MANAGE)
  const {data, isLoading, error} = useGetHandbookArticleQuery(articleId ?? "", {
    skip: !articleId
  })
  const [updateArticle, {isLoading: saving}] =
    useUpdateHandbookArticleMutation()
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")

  useEffect(() => {
    if (data) {
      setTitle(data.title)
      setBody(data.body)
    }
  }, [data])

  if (isLoading) {
    return <Loader />
  }

  if (error || !data) {
    return (
      <Text p="md" c="red">
        {t("handbook.load_error")}
      </Text>
    )
  }

  const save = async () => {
    if (!articleId) {
      return
    }
    await updateArticle({id: articleId, title, body}).unwrap()
  }

  return (
    <div className={classes.page}>
      <Stack className={classes.scroll} p="md" gap="md">
        <Anchor component={Link} to="/handbook" size="sm">
          {t("handbook.back")}
        </Anchor>
        {canManage ? (
          <TextInput
            value={title}
            onChange={e => setTitle(e.currentTarget.value)}
            size="lg"
          />
        ) : (
          <Title order={3}>{data.title}</Title>
        )}
        <Text size="sm" c="dimmed">
          {formatApiDateTimeCompact(data.updated_at)}
          {data.author_username ? ` · ${data.author_username}` : ""}
        </Text>
        {canManage ? (
          <>
            <HandbookEditor
              articleId={data.id}
              html={body}
              onChange={setBody}
            />
            <Group justify="flex-end">
              <Button onClick={() => void save()} loading={saving}>
                {t("common.save")}
              </Button>
            </Group>
          </>
        ) : (
          <div
            className={articleClasses.article}
            dangerouslySetInnerHTML={{__html: data.body || ""}}
          />
        )}
      </Stack>
    </div>
  )
}
