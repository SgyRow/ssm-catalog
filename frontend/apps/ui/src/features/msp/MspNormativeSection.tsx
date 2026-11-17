import NormativeLinkPickerModal from "@/features/msp/NormativeLinkPickerModal"
import {
  useCreateMspNormativeLinkMutation,
  useDeleteMspNormativeLinkMutation,
  useGetNormativeRegistryQuery,
  useListMspNormativeLinksQuery,
  type MspNormativeLink
} from "@/features/msp/mspApiSlice"
import LibraryBookmarkButtons from "@/features/library/components/LibraryBookmarkButtons"
import {formatNodeDisplayTitle} from "@/utils"
import type {NodeType} from "@/types"
import {
  Accordion,
  ActionIcon,
  Anchor,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  ThemeIcon
} from "@mantine/core"
import {notifications} from "@mantine/notifications"
import {IconFile, IconFolder, IconLink, IconTrash} from "@tabler/icons-react"
import {useMemo, useState} from "react"
import {Link} from "react-router-dom"
import {useTranslation} from "react-i18next"

import classes from "./MspView.module.css"

const DEFAULT_BUCKETS = ["Федеральные", "Региональные"] as const

type ChildNav = {
  to: string
  state?: unknown
}

type Props = {
  mspId: string
  /** Physical "Нормативные правовые документы" folder under the measure. */
  folderNode?: NodeType
  childNav?: (node: NodeType) => ChildNav
  canEdit?: boolean
}

function LinkRow({
  link,
  childNav,
  canEdit,
  onUnlink,
  unlinking
}: {
  link: MspNormativeLink
  childNav?: (node: NodeType) => ChildNav
  canEdit?: boolean
  onUnlink?: () => void
  unlinking?: boolean
}) {
  const {t} = useTranslation()
  const nav = childNav?.({
    id: link.document_id,
    ctype: "document",
    title: link.title
  } as NodeType) ?? {to: `/document/${link.document_id}`}
  const titleBlock = (
    <Group wrap="nowrap" gap="md" align="center" style={{flex: 1, minWidth: 0}}>
      <ThemeIcon
        variant="light"
        color="gray"
        size="lg"
        radius="md"
        aria-hidden
        style={{flexShrink: 0}}
      >
        <IconFile size={20} stroke={1.5} />
      </ThemeIcon>
      <div className={classes.nodeTitleWrap}>
        <Text fw={600} size="md" className={classes.nodeTitle}>
          {formatNodeDisplayTitle(link.title, "document")}
        </Text>
      </div>
    </Group>
  )

  return (
    <Paper withBorder p="md" radius="md">
      <Group wrap="nowrap" gap="md" justify="space-between" align="center">
        <Anchor
          component={Link}
          to={nav.to}
          state={nav.state}
          underline="never"
          c="var(--mantine-color-text)"
          style={{flex: 1, minWidth: 0}}
        >
          {titleBlock}
        </Anchor>
        <Group gap="xs" wrap="nowrap" style={{flexShrink: 0}}>
          <LibraryBookmarkButtons nodeId={link.document_id} size="sm" />
          {canEdit ? (
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={t("msp.normative.unlink")}
              loading={unlinking}
              onClick={e => {
                e.preventDefault()
                e.stopPropagation()
                onUnlink?.()
              }}
            >
              <IconTrash size={16} stroke={1.5} />
            </ActionIcon>
          ) : null}
        </Group>
      </Group>
    </Paper>
  )
}

export default function MspNormativeSection({
  mspId,
  folderNode,
  childNav,
  canEdit = false
}: Props) {
  const {t} = useTranslation()
  const {data: links = [], isLoading} = useListMspNormativeLinksQuery(mspId)
  const {data: registry} = useGetNormativeRegistryQuery(undefined, {
    skip: !canEdit
  })
  const [createLink, {isLoading: linking}] = useCreateMspNormativeLinkMutation()
  const [deleteLink, {isLoading: unlinking}] =
    useDeleteMspNormativeLinkMutation()
  const [pickerBucket, setPickerBucket] = useState<string | null>(null)

  const byBucket = useMemo(() => {
    const map = new Map<string, MspNormativeLink[]>()
    for (const bucket of DEFAULT_BUCKETS) {
      map.set(bucket, [])
    }
    for (const link of links) {
      const list = map.get(link.bucket) ?? []
      list.push(link)
      map.set(link.bucket, list)
    }
    return map
  }, [links])

  const buckets = useMemo(() => {
    const titles = new Set<string>([...DEFAULT_BUCKETS])
    for (const link of links) {
      titles.add(link.bucket)
    }
    return [...titles]
  }, [links])

  const excludeIds = useMemo(
    () => new Set(links.map(l => l.document_id)),
    [links]
  )

  const onAttach = async (document: {id: string; title: string}) => {
    if (!pickerBucket) {
      return
    }
    try {
      await createLink({
        msp_id: mspId,
        document_id: document.id,
        bucket: pickerBucket
      }).unwrap()
      notifications.show({
        color: "green",
        message: t("msp.normative.attached")
      })
    } catch {
      notifications.show({
        color: "red",
        message: t("msp.normative.attach_error")
      })
    }
  }

  const onUnlink = async (linkId: string) => {
    try {
      await deleteLink({msp_id: mspId, link_id: linkId}).unwrap()
      notifications.show({
        color: "green",
        message: t("msp.normative.unlinked")
      })
    } catch {
      notifications.show({
        color: "red",
        message: t("msp.normative.unlink_error")
      })
    }
  }

  const sectionTitle =
    folderNode?.title ?? t("msp.normative.section_title")

  return (
    <>
      <Accordion chevronPosition="left" variant="separated" defaultValue={null}>
        <Accordion.Item value="normative">
          <div className={classes.sectionHead}>
            <Accordion.Control>
              <Group gap="sm" wrap="nowrap">
                <ThemeIcon
                  variant="light"
                  color="yellow"
                  size="md"
                  radius="md"
                  aria-hidden
                >
                  <IconFolder size={18} stroke={1.5} />
                </ThemeIcon>
                <Text size="sm" fw={600}>
                  {sectionTitle}
                </Text>
              </Group>
            </Accordion.Control>
            {folderNode ? (
              <div className={classes.sectionActions}>
                <LibraryBookmarkButtons nodeId={folderNode.id} size="sm" />
              </div>
            ) : null}
          </div>
          <Accordion.Panel>
            {isLoading ? (
              <Loader size="sm" my="xs" />
            ) : (
              <Accordion
                multiple
                chevronPosition="left"
                variant="separated"
                defaultValue={[]}
              >
                {buckets.map(bucket => {
                  const bucketLinks = byBucket.get(bucket) ?? []
                  return (
                    <Accordion.Item key={bucket} value={bucket}>
                      <div className={classes.sectionHead}>
                        <Accordion.Control>
                          <Group gap="sm" wrap="nowrap">
                            <ThemeIcon
                              variant="light"
                              color="yellow"
                              size="sm"
                              radius="md"
                              aria-hidden
                            >
                              <IconFolder size={14} stroke={1.5} />
                            </ThemeIcon>
                            <Text size="sm" fw={600}>
                              {bucket}
                            </Text>
                          </Group>
                        </Accordion.Control>
                        {canEdit ? (
                          <div className={classes.sectionActions}>
                            <Button
                              size="xs"
                              variant="light"
                              leftSection={<IconLink size={14} />}
                              loading={linking && pickerBucket === bucket}
                              onClick={e => {
                                e.preventDefault()
                                e.stopPropagation()
                                setPickerBucket(bucket)
                              }}
                            >
                              {t("msp.normative.attach")}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      <Accordion.Panel>
                        {bucketLinks.length === 0 ? (
                          <Text size="xs" c="dimmed">
                            {t("msp.view.folder_empty")}
                          </Text>
                        ) : (
                          <Stack gap="xs">
                            {bucketLinks.map(link => (
                              <LinkRow
                                key={link.id}
                                link={link}
                                childNav={childNav}
                                canEdit={canEdit}
                                unlinking={unlinking}
                                onUnlink={() => void onUnlink(link.id)}
                              />
                            ))}
                          </Stack>
                        )}
                      </Accordion.Panel>
                    </Accordion.Item>
                  )
                })}
              </Accordion>
            )}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      {canEdit && registry && pickerBucket ? (
        <NormativeLinkPickerModal
          opened={pickerBucket !== null}
          onClose={() => setPickerBucket(null)}
          registry={registry}
          bucketTitle={pickerBucket}
          excludeDocumentIds={excludeIds}
          onPick={doc => void onAttach(doc)}
        />
      ) : null}
    </>
  )
}
