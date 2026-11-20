import {useGetPortalNodesQuery} from "@/features/portal/portalApiSlice"
import type {NormativeRegistry} from "@/features/msp/mspApiSlice"
import type {NodeType} from "@/types"
import {formatNodeDisplayTitle} from "@/utils"
import {
  Anchor,
  Button,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Table,
  Text
} from "@mantine/core"
import {IconFile, IconFolder} from "@tabler/icons-react"
import {useEffect, useMemo, useState} from "react"
import {useTranslation} from "react-i18next"

type FolderCrumb = {id: string; title: string}

type Props = {
  opened: boolean
  onClose: () => void
  registry: NormativeRegistry
  /** Prefill navigation into this bucket folder when opened. */
  bucketTitle: string
  excludeDocumentIds?: Set<string>
  onPick: (document: {id: string; title: string}) => void
}

/** Split "Федеральные — Приказы Министерств" into bucket + type crumbs. */
function parseBucketTypeTitle(title: string): {
  bucketTitle: string | null
  typeTitle: string | null
} {
  const sep = " — "
  if (title.includes(sep)) {
    const [bucket, typ] = title.split(sep, 2)
    return {
      bucketTitle: bucket.trim() || null,
      typeTitle: typ.trim() || null
    }
  }
  return {bucketTitle: title || null, typeTitle: null}
}

export default function NormativeLinkPickerModal({
  opened,
  onClose,
  registry,
  bucketTitle,
  excludeDocumentIds,
  onPick
}: Props) {
  const {t} = useTranslation()
  const {bucketTitle: rootBucketTitle, typeTitle} =
    parseBucketTypeTitle(bucketTitle)
  const bucket = registry.buckets.find(b => b.title === rootBucketTitle)
  const startFolder: FolderCrumb = bucket
    ? {id: bucket.folder_id, title: bucket.title}
    : {id: registry.folder_id, title: registry.title}

  const [stack, setStack] = useState<FolderCrumb[]>([startFolder])
  const [typeDrillDone, setTypeDrillDone] = useState(false)

  useEffect(() => {
    if (opened) {
      setStack([startFolder])
      setTypeDrillDone(false)
    }
    // Only reset when the modal opens or the target bucket changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, bucketTitle, registry.folder_id])

  const parentId = stack[stack.length - 1]?.id
  const {data, isLoading} = useGetPortalNodesQuery(
    {parentId: parentId!, page_size: 200},
    {skip: !opened || !parentId}
  )
  const items = useMemo(() => data?.items ?? [], [data?.items])

  // Auto-enter the type subfolder when the virtual title is "Bucket — Type".
  useEffect(() => {
    if (!opened || typeDrillDone || !typeTitle || isLoading) return
    if (stack.length !== 1 || stack[0]?.id !== startFolder.id) {
      setTypeDrillDone(true)
      return
    }
    const match = items.find(
      (n: NodeType) => n.ctype === "folder" && n.title === typeTitle
    )
    if (match) {
      setStack(prev => [...prev, {id: match.id, title: match.title}])
    }
    setTypeDrillDone(true)
  }, [
    opened,
    typeDrillDone,
    typeTitle,
    isLoading,
    items,
    stack,
    startFolder.id
  ])

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("msp.normative.pick_title")}
      size="lg"
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {t("msp.normative.pick_hint", {bucket: bucketTitle})}
        </Text>
        <Group gap="xs" wrap="wrap">
          <Anchor
            component="button"
            type="button"
            size="sm"
            onClick={() =>
              setStack([{id: registry.folder_id, title: registry.title}])
            }
          >
            {registry.title}
          </Anchor>
          {stack.map((crumb, idx) =>
            crumb.id === registry.folder_id ? null : (
              <Group gap={4} key={crumb.id} wrap="nowrap">
                <Text size="sm">/</Text>
                <Anchor
                  component="button"
                  type="button"
                  size="sm"
                  onClick={() => setStack(stack.slice(0, idx + 1))}
                >
                  {crumb.title}
                </Anchor>
              </Group>
            )
          )}
        </Group>
        {isLoading ? (
          <Loader size="sm" />
        ) : (
          <ScrollArea.Autosize mah={360}>
            <Table highlightOnHover>
              <Table.Tbody>
                {items.length === 0 ? (
                  <Table.Tr>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {t("msp.view.folder_empty")}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  items.map((node: NodeType) => {
                    const isFolder = node.ctype === "folder"
                    const already = excludeDocumentIds?.has(node.id)
                    return (
                      <Table.Tr key={node.id}>
                        <Table.Td>
                          <Group gap="sm" wrap="nowrap">
                            {isFolder ? (
                              <IconFolder size={18} stroke={1.5} />
                            ) : (
                              <IconFile size={18} stroke={1.5} />
                            )}
                            {isFolder ? (
                              <Anchor
                                component="button"
                                type="button"
                                onClick={() =>
                                  setStack(prev => [
                                    ...prev,
                                    {id: node.id, title: node.title}
                                  ])
                                }
                              >
                                {node.title}
                              </Anchor>
                            ) : (
                              <Text size="sm">
                                {formatNodeDisplayTitle(node.title, node.ctype)}
                              </Text>
                            )}
                          </Group>
                        </Table.Td>
                        <Table.Td width={120}>
                          {isFolder ? null : (
                            <Button
                              size="xs"
                              variant="light"
                              disabled={already}
                              onClick={() => {
                                onPick({id: node.id, title: node.title})
                                onClose()
                              }}
                            >
                              {already
                                ? t("msp.normative.already_linked")
                                : t("msp.normative.attach")}
                            </Button>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    )
                  })
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        )}
      </Stack>
    </Modal>
  )
}
