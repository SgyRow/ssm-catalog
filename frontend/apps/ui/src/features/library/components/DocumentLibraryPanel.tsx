import {
  useDeleteLibraryCommentMutation,
  useGetLibraryCommentsQuery,
  useGetLibraryNoteQuery,
  useGetLibraryRatingQuery,
  usePostLibraryCommentMutation,
  usePutLibraryCommentMutation,
  usePutLibraryNoteMutation,
  usePutLibraryRatingMutation
} from "@/features/library/libraryApiSlice"
import {useAppSelector} from "@/app/hooks"
import {
  COMMENT_CREATE,
  COMMENT_DELETE,
  COMMENT_UPDATE,
  NODE_UPDATE
} from "@/scopes"
import {selectCurrentUser} from "@/slices/currentUser"
import type {User} from "@/types"
import {formatApiDateTime} from "@/utils/formatDateTime"
import {
  Button,
  Divider,
  Group,
  Rating,
  Stack,
  Text,
  Textarea,
  TextInput
} from "@mantine/core"
import {notifications} from "@mantine/notifications"
import {useEffect, useState} from "react"
import {useTranslation} from "react-i18next"

interface Props {
  documentId: string
}

export default function DocumentLibraryPanel({documentId}: Props) {
  const {t} = useTranslation()
  const user = useAppSelector(selectCurrentUser) as User | null
  const scopes = user?.scopes ?? []
  const canCreateComments = scopes.includes(COMMENT_CREATE)
  const canModerateCommentsEdit = scopes.includes(COMMENT_UPDATE)
  const canModerateCommentsDelete = scopes.includes(COMMENT_DELETE)
  const canEditPrivateNote = scopes.includes(NODE_UPDATE)
  const {data: note, isLoading: noteLoading} = useGetLibraryNoteQuery(
    documentId,
    {skip: !canEditPrivateNote}
  )
  const {data: rating} = useGetLibraryRatingQuery(documentId)
  const {data: comments, refetch: refetchComments} =
    useGetLibraryCommentsQuery(documentId)
  const [putNote, {isLoading: savingNote}] = usePutLibraryNoteMutation()
  const [postComment, {isLoading: posting}] = usePostLibraryCommentMutation()
  const [putComment, {isLoading: savingComment}] =
    usePutLibraryCommentMutation()
  const [deleteComment, {isLoading: deletingComment}] =
    useDeleteLibraryCommentMutation()
  const [putRating, {isLoading: savingRating}] = usePutLibraryRatingMutation()

  const [noteDraft, setNoteDraft] = useState("")
  const [commentDraft, setCommentDraft] = useState("")
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentDraft, setEditingCommentDraft] = useState("")

  useEffect(() => {
    if (note?.body !== undefined) {
      setNoteDraft(note.body)
    } else if (note === null) {
      setNoteDraft("")
    }
  }, [note])

  return (
    <Stack gap="sm" mt="md">
      <Divider label={t("library.panel_title")} labelPosition="center" />
      {canEditPrivateNote ? (
        <>
          <Text size="sm" fw={600}>
            {t("library.my_note")}
          </Text>
          <Textarea
            placeholder={t("library.note_placeholder")}
            value={noteLoading ? "" : noteDraft}
            onChange={e => setNoteDraft(e.currentTarget.value)}
            minRows={3}
            disabled={noteLoading}
          />
          <Button
            size="xs"
            loading={savingNote}
            onClick={async () => {
              try {
                await putNote({documentId, body: noteDraft}).unwrap()
                notifications.show({
                  title: t("library.note_saved"),
                  color: "green"
                })
              } catch {
                notifications.show({title: t("library.error"), color: "red"})
              }
            }}
          >
            {t("common.save")}
          </Button>
        </>
      ) : null}

      <Text size="sm" fw={600} mt="sm">
        {t("library.rating")}
      </Text>
      <Group>
        <Rating
          value={rating?.score && rating.score > 0 ? rating.score : 0}
          onChange={async v => {
            if (!v) {
              return
            }
            try {
              await putRating({documentId, score: v}).unwrap()
            } catch {
              notifications.show({title: t("library.error"), color: "red"})
            }
          }}
          count={5}
          disabled={savingRating}
        />
        {rating?.avg_score != null && rating.vote_count != null ? (
          <Text size="xs" c="dimmed">
            {t("library.rating_avg", {
              avg: rating.avg_score.toFixed(1),
              n: rating.vote_count
            })}
          </Text>
        ) : null}
      </Group>

      <Text size="sm" fw={600} mt="sm">
        {t("library.comments")}
      </Text>
      <Stack gap="xs">
        {(comments ?? []).map(c => {
          const isOwnComment = user?.id === c.user_id
          const canEditComment = isOwnComment || canModerateCommentsEdit
          const canDeleteComment = isOwnComment || canModerateCommentsDelete

          return (
          <Stack
            key={c.id}
            gap={2}
            p="xs"
            style={{
              border: "1px solid var(--mantine-color-default-border)",
              borderRadius: 4
            }}
          >
            {editingCommentId === c.id ? (
              <Textarea
                value={editingCommentDraft}
                onChange={e => setEditingCommentDraft(e.currentTarget.value)}
                minRows={2}
              />
            ) : (
              <Text size="sm">{c.body}</Text>
            )}
            <Text size="xs" c="dimmed">
              {c.author} - {formatApiDateTime(c.created_at)}
            </Text>
            {canEditComment || canDeleteComment ? (
              <Group gap="xs">
                {canEditComment && editingCommentId !== c.id ? (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => {
                      setEditingCommentId(c.id)
                      setEditingCommentDraft(c.body)
                    }}
                  >
                    {t("common.edit")}
                  </Button>
                ) : null}
                {canEditComment && editingCommentId === c.id ? (
                  <>
                    <Button
                      size="compact-xs"
                      loading={savingComment}
                      onClick={async () => {
                        const nextBody = editingCommentDraft.trim()
                        if (!nextBody) {
                          return
                        }
                        try {
                          await putComment({
                            documentId,
                            commentId: c.id,
                            body: nextBody
                          }).unwrap()
                          setEditingCommentId(null)
                          setEditingCommentDraft("")
                          notifications.show({
                            title: t("library.comment_updated"),
                            color: "green"
                          })
                          refetchComments()
                        } catch {
                          notifications.show({
                            title: t("library.error"),
                            color: "red"
                          })
                        }
                      }}
                    >
                      {t("common.save")}
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="default"
                      onClick={() => {
                        setEditingCommentId(null)
                        setEditingCommentDraft("")
                      }}
                    >
                      {t("common.cancel")}
                    </Button>
                  </>
                ) : null}
                {canDeleteComment ? (
                  <Button
                    size="compact-xs"
                    color="red"
                    variant="subtle"
                    loading={deletingComment}
                    onClick={async () => {
                      try {
                        await deleteComment({
                          documentId,
                          commentId: c.id
                        }).unwrap()
                        if (editingCommentId === c.id) {
                          setEditingCommentId(null)
                          setEditingCommentDraft("")
                        }
                        notifications.show({
                          title: t("library.comment_deleted"),
                          color: "green"
                        })
                        refetchComments()
                      } catch {
                        notifications.show({
                          title: t("library.error"),
                          color: "red"
                        })
                      }
                    }}
                  >
                    {t("common.delete")}
                  </Button>
                ) : null}
              </Group>
            ) : null}
          </Stack>
          )
        })}
      </Stack>
      <TextInput
        placeholder={t("library.comment_placeholder")}
        value={commentDraft}
        onChange={e => setCommentDraft(e.currentTarget.value)}
        disabled={!canCreateComments}
      />
      <Button
        size="xs"
        loading={posting}
        disabled={!canCreateComments}
        onClick={async () => {
          if (!commentDraft.trim()) {
            return
          }
          try {
            await postComment({documentId, body: commentDraft.trim()}).unwrap()
            setCommentDraft("")
            refetchComments()
            notifications.show({
              title: t("library.comment_added"),
              color: "green"
            })
          } catch {
            notifications.show({title: t("library.error"), color: "red"})
          }
        }}
      >
        {t("library.add_comment")}
      </Button>
    </Stack>
  )
}
