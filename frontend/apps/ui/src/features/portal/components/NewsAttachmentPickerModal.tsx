import {useGetPortalNodesQuery} from "@/features/portal/portalApiSlice"
import type {NodeType} from "@/types"
import {drop_extension} from "@/utils"
import {
  Anchor,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title
} from "@mantine/core"
import {IconFile, IconFolder} from "@tabler/icons-react"
import {useEffect, useMemo, useState} from "react"
import {useTranslation} from "react-i18next"

export type AttachmentPick = {node_id: string; title: string}

type FolderCrumb = {id: string; title: string}

type Props = {
  opened: boolean
  onClose: () => void
  portalRoot: {id: string; title: string}
  value: AttachmentPick[]
  onChange: (next: AttachmentPick[]) => void
  maxAttachments?: number
}

export default function NewsAttachmentPickerModal({
  opened,
  onClose,
  portalRoot,
  value,
  onChange,
  maxAttachments = 30
}: Props) {
  const {t} = useTranslation()
  const portalRootLabel = t("portal.root_folder")
  const [stack, setStack] = useState<FolderCrumb[]>([
    {id: portalRoot.id, title: portalRootLabel}
  ])

  const parentId = stack[stack.length - 1].id

  useEffect(() => {
    if (opened) {
      setStack([{id: portalRoot.id, title: portalRootLabel}])
    }
  }, [opened, portalRoot.id, portalRootLabel])

  const {data, isLoading} = useGetPortalNodesQuery(
    {parentId, page_size: 200},
    {skip: !opened}
  )

  const items = useMemo(() => data?.items ?? [], [data?.items])

  const handleClose = () => {
    onClose()
  }

  const isPicked = (id: string) => value.some(p => p.node_id === id)

  const addDocument = (node: NodeType) => {
    if (node.ctype !== "document") {
      return
    }
    if (isPicked(node.id)) {
      return
    }
    if (value.length >= maxAttachments) {
      return
    }
    onChange([...value, {node_id: node.id, title: node.title}])
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t("portal.news_pick_attachments")}
      size="lg"
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {t("portal.news_pick_attachments_hint")}
        </Text>
        <Group gap="xs" wrap="wrap">
          {stack.map((crumb, idx) => (
            <Group gap={4} key={crumb.id} wrap="nowrap">
              {idx > 0 ? <Text size="sm">/</Text> : null}
              <Anchor
                component="button"
                type="button"
                size="sm"
                onClick={() => setStack(stack.slice(0, idx + 1))}
              >
                {crumb.title}
              </Anchor>
            </Group>
          ))}
        </Group>
        <Paper withBorder>
          {isLoading ? (
            <Loader p="md" />
          ) : (
            <ScrollArea h={280}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("portal.col_name")}</Table.Th>
                    <Table.Th>{t("portal.col_type")}</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {items.map(row => (
                    <Table.Tr key={row.id}>
                      <Table.Td>
                        {row.ctype === "folder" ? (
                          <Group gap="xs">
                            <IconFolder size={18} />
                            <Anchor
                              component="button"
                              type="button"
                              onClick={() =>
                                setStack([...stack, {id: row.id, title: row.title}])
                              }
                            >
                              {row.title}
                            </Anchor>
                          </Group>
                        ) : (
                          <Group gap="xs">
                            <IconFile size={18} />
                            <Text size="sm">{drop_extension(row.title)}</Text>
                          </Group>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {row.ctype === "folder"
                          ? t("portal.type_folder")
                          : t("portal.type_document")}
                      </Table.Td>
                      <Table.Td>
                        {row.ctype === "document" ? (
                          <Button
                            size="compact-xs"
                            variant="light"
                            disabled={isPicked(row.id) || value.length >= maxAttachments}
                            onClick={() => addDocument(row)}
                          >
                            {isPicked(row.id)
                              ? t("portal.news_attachment_added")
                              : t("portal.news_add_document")}
                          </Button>
                        ) : null}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </Paper>
        <Title order={6}>{t("portal.news_selected_attachments")}</Title>
        {value.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t("portal.news_no_attachments_selected")}
          </Text>
        ) : (
          <Group gap="xs" wrap="wrap">
            {value.map(att => (
              <Button
                key={att.node_id}
                size="compact-xs"
                variant="default"
                onClick={() =>
                  onChange(value.filter(p => p.node_id !== att.node_id))
                }
              >
                {drop_extension(att.title)} ×
              </Button>
            ))}
          </Group>
        )}
        <Group justify="flex-end">
          <Button onClick={handleClose}>{t("common.close")}</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
