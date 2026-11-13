import classes from "@/components/ViewportPage.module.css"
import articleClasses from "@/features/handbook/Handbook.module.css"
import HandbookEditor from "@/features/handbook/components/HandbookEditor"
import {
  useGetHandbookArticleQuery,
  useReplaceHandbookDocumentMutation,
  useUpdateHandbookArticleMutation
} from "@/features/handbook/handbookApiSlice"
import PublicDocumentPreviewBody from "@/features/public/components/PublicDocumentPreviewBody"
import {PORTAL_FEED_MANAGE} from "@/scopes"
import {selectCurrentUser} from "@/slices/currentUser"
import type {UserDetails} from "@/types"
import {formatApiDateTimeCompact} from "@/utils/formatDateTime"
import {
  Anchor,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Title
} from "@mantine/core"
import {notifications} from "@mantine/notifications"
import {
  IconCheck,
  IconDownload,
  IconFile,
  IconUpload
} from "@tabler/icons-react"
import {useEffect, useRef, useState} from "react"
import {useSelector} from "react-redux"
import {Link, useParams} from "react-router-dom"
import {useTranslation} from "react-i18next"

function formatBytes(n: number): string {
  if (!n || n < 1024) {
    return `${n ?? 0} B`
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`
  }
  if (n < 1024 * 1024 * 1024) {
    return `${(n / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

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
  const [replaceDocument, {isLoading: replacing}] =
    useReplaceHandbookDocumentMutation()
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const bodyRef = useRef("")
  const replaceInput = useRef<HTMLInputElement>(null)
  const flashTimer = useRef<number | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    if (data) {
      setTitle(data.title)
      setBody(data.body)
      bodyRef.current = data.body
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
    try {
      if (data.kind === "file") {
        await updateArticle({id: articleId, title}).unwrap()
      } else {
        await updateArticle({
          id: articleId,
          title,
          body: bodyRef.current
        }).unwrap()
      }
      setSavedFlash(true)
      notifications.show({
        message: t("handbook.saved"),
        color: "green",
        autoClose: 4000
      })
      if (flashTimer.current !== null) {
        window.clearTimeout(flashTimer.current)
      }
      flashTimer.current = window.setTimeout(() => setSavedFlash(false), 4000)
    } catch {
      setSavedFlash(false)
      notifications.show({
        message: t("handbook.save_error"),
        color: "red"
      })
    }
  }

  const onReplace = async (file: File) => {
    if (!articleId) {
      return
    }
    try {
      await replaceDocument({id: articleId, file}).unwrap()
      setSavedFlash(true)
      notifications.show({
        message: t("handbook.doc_replaced"),
        color: "green",
        autoClose: 4000
      })
      if (flashTimer.current !== null) {
        window.clearTimeout(flashTimer.current)
      }
      flashTimer.current = window.setTimeout(() => setSavedFlash(false), 4000)
    } catch {
      setSavedFlash(false)
      notifications.show({
        message: t("handbook.doc_failed"),
        color: "red"
      })
    }
  }

  const saveButton = (
    <Group justify="flex-end">
      <Button
        color={savedFlash ? "green" : undefined}
        leftSection={savedFlash ? <IconCheck size={16} /> : undefined}
        onClick={() => void save()}
        loading={saving}
      >
        {savedFlash ? t("handbook.saved") : t("common.save")}
      </Button>
    </Group>
  )

  const renderFile = () => {
    const file = data.file
    if (!file) {
      return null
    }
    const meta = [
      file.filename,
      file.size_bytes ? formatBytes(file.size_bytes) : "",
      formatApiDateTimeCompact(data.updated_at),
      data.author_username
    ]
      .filter(Boolean)
      .join(" · ")
    return (
      <>
        <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
          <Group
            align="center"
            gap={6}
            wrap="nowrap"
            style={{flex: 1, minWidth: 0}}
          >
            <IconFile size={18} style={{flexShrink: 0}} />
            {canManage ? (
              <TextInput
                value={title}
                onChange={e => {
                  setTitle(e.currentTarget.value)
                  setSavedFlash(false)
                }}
                size="sm"
                style={{flex: 1, minWidth: 0}}
              />
            ) : (
              <Text
                size="lg"
                fw={600}
                lineClamp={1}
                style={{flex: 1, minWidth: 0}}
              >
                {data.title}
              </Text>
            )}
          </Group>
          <Group gap="xs" wrap="nowrap" style={{flexShrink: 0}}>
            {canManage ? (
              <Button
                size="xs"
                variant="subtle"
                color={savedFlash ? "green" : undefined}
                leftSection={savedFlash ? <IconCheck size={14} /> : undefined}
                onClick={() => void save()}
                loading={saving}
              >
                {savedFlash ? t("handbook.saved") : t("common.save")}
              </Button>
            ) : null}
            {canManage ? (
              <Button
                size="xs"
                variant="subtle"
                leftSection={<IconUpload size={14} />}
                onClick={() => replaceInput.current?.click()}
                loading={replacing}
              >
                {t("handbook.doc_replace")}
              </Button>
            ) : null}
            <Button
              size="xs"
              variant="light"
              component="a"
              href={file.url}
              target="_blank"
              rel="noreferrer"
              leftSection={<IconDownload size={14} />}
            >
              {t("handbook.doc_download")}
            </Button>
          </Group>
        </Group>
        <Text size="xs" c="dimmed" truncate>
          {meta}
        </Text>
        <PublicDocumentPreviewBody
          downloadUrl={file.url}
          fileName={file.filename}
        />
        {canManage ? (
          <input
            ref={replaceInput}
            type="file"
            hidden
            onChange={e => {
              const f = e.currentTarget.files?.[0]
              e.currentTarget.value = ""
              if (f) void onReplace(f)
            }}
          />
        ) : null}
      </>
    )
  }

  return (
    <div className={classes.page}>
      <Stack className={classes.scroll} p="md" gap="md">
        <Anchor component={Link} to="/handbook" size="sm">
          {t("handbook.back")}
        </Anchor>
        {data.kind === "file" ? (
          renderFile()
        ) : (
          <>
            {canManage ? (
              <TextInput
                value={title}
                onChange={e => {
                  setTitle(e.currentTarget.value)
                  setSavedFlash(false)
                }}
                size="md"
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
                  onChange={html => {
                    bodyRef.current = html
                    setBody(html)
                    setSavedFlash(false)
                  }}
                />
                {saveButton}
              </>
            ) : (
              <div
                className={articleClasses.article}
                dangerouslySetInnerHTML={{__html: data.body || ""}}
              />
            )}
          </>
        )}
      </Stack>
    </div>
  )
}
