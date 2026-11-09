import {isEmptyMspBody} from "@/features/msp/html"
import {MspRichTextEditor, MspRichTextView} from "@/features/msp/MspRichText"
import {
  downloadMspPdf,
  useGetMspTypeQuery,
  useUpdateMspMutation,
  type Msp,
  type MspType
} from "@/features/msp/mspApiSlice"
import {formatNodeDisplayTitle} from "@/utils"
import type {NodeType} from "@/types"
import {
  Accordion,
  Anchor,
  Button,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  TextInput,
  ThemeIcon
} from "@mantine/core"
import {notifications} from "@mantine/notifications"
import {
  IconChevronRight,
  IconDownload,
  IconFile,
  IconFolder,
  IconPencil
} from "@tabler/icons-react"
import {useCallback, useEffect, useMemo, useState} from "react"
import {Link} from "react-router-dom"
import {useTranslation} from "react-i18next"

import classes from "./MspView.module.css"

/**
 * Document-like rendering of a measure: each filled section is shown as a
 * titled block of paragraphs. Users with update permission can edit the
 * title and section bodies in place.
 */
type ChildNav = {
  to: string
  state?: unknown
}

type EditField = {
  key: string
  type_section_id: string | null
  title: string
  body: string
}

function buildEditFields(msp: Msp, mspType: MspType | undefined): EditField[] {
  const byTypeId = new Map(
    msp.sections
      .filter(s => s.type_section_id)
      .map(s => [s.type_section_id as string, s])
  )
  const fields: EditField[] = []
  const seen = new Set<string>()

  for (const ts of mspType?.sections ?? []) {
    const existing = byTypeId.get(ts.id)
    fields.push({
      key: ts.id,
      type_section_id: ts.id,
      title: ts.title,
      body: existing?.body ?? ""
    })
    seen.add(ts.id)
  }

  for (const section of msp.sections) {
    const tid = section.type_section_id
    if (tid && seen.has(tid)) {
      continue
    }
    const key = tid ?? `orphan-${section.id}`
    fields.push({
      key,
      type_section_id: tid,
      title: section.title,
      body: section.body ?? ""
    })
    if (tid) {
      seen.add(tid)
    }
  }

  if (fields.length === 0) {
    for (const section of msp.sections) {
      fields.push({
        key: section.id,
        type_section_id: section.type_section_id,
        title: section.title,
        body: section.body ?? ""
      })
    }
  }

  return fields
}

export default function MspView({
  msp,
  childrenNodes = [],
  childNav,
  canEdit = false
}: {
  msp: Msp
  childrenNodes?: NodeType[]
  childNav?: (node: NodeType) => ChildNav
  canEdit?: boolean
}) {
  const {t} = useTranslation()
  const [downloading, setDownloading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(msp.title)
  const [bodies, setBodies] = useState<Record<string, string>>({})

  const {data: mspType} = useGetMspTypeQuery(msp.msp_type_id, {
    skip: !canEdit && !editing
  })
  const [updateMsp, {isLoading: saving}] = useUpdateMspMutation()

  const editFields = useMemo(
    () => buildEditFields(msp, mspType),
    [msp, mspType]
  )

  useEffect(() => {
    if (!editing) {
      return
    }
    setBodies(prev => {
      const next = {...prev}
      let changed = false
      for (const field of editFields) {
        if (!(field.key in next)) {
          next[field.key] = field.body
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [editing, editFields])

  const startEdit = () => {
    setTitle(msp.title)
    const next: Record<string, string> = {}
    for (const field of buildEditFields(msp, mspType)) {
      next[field.key] = field.body
    }
    setBodies(next)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setTitle(msp.title)
    setBodies({})
  }

  const onSave = async () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      return
    }
    try {
      await updateMsp({
        msp_id: msp.id,
        title: trimmedTitle,
        sections: editFields.map(field => ({
          type_section_id: field.type_section_id,
          title: field.title,
          body: bodies[field.key] ?? ""
        }))
      }).unwrap()
      setEditing(false)
      notifications.show({message: t("msp.view.saved"), color: "green"})
    } catch (error) {
      notifications.show({
        title: t("msp.view.save_error"),
        message: error instanceof Error ? error.message : "",
        color: "red"
      })
    }
  }

  const onDownload = useCallback(async () => {
    setDownloading(true)
    try {
      await downloadMspPdf(msp.id, msp.title)
    } catch (error) {
      notifications.show({
        title: t("msp.view.pdf_error"),
        message:
          error instanceof Error && error.message
            ? error.message
            : "",
        color: "red"
      })
    } finally {
      setDownloading(false)
    }
  }, [msp.id, msp.title, t])

  return (
    <Stack gap="md" className={classes.root}>
      <Group
        justify="space-between"
        align="flex-start"
        wrap="wrap"
        gap="sm"
        className={classes.header}
      >
        <div style={{minWidth: 0, flex: 1}}>
          {editing ? (
            <TextInput
              value={title}
              onChange={e => setTitle(e.currentTarget.value)}
              label={t("msp.form.title")}
            />
          ) : (
            <>
              <Text size="lg" fw={700}>
                {msp.title}
              </Text>
              {msp.msp_type_name ? (
                <Text size="sm" c="dimmed">
                  {msp.msp_type_name}
                </Text>
              ) : null}
            </>
          )}
        </div>
        <Group gap="xs" wrap="nowrap">
          {canEdit && !editing ? (
            <Button
              variant="default"
              leftSection={<IconPencil size={16} />}
              onClick={startEdit}
            >
              {t("msp.view.edit")}
            </Button>
          ) : null}
          <Button
            variant="light"
            leftSection={<IconDownload size={16} />}
            onClick={onDownload}
            loading={downloading}
            disabled={editing}
          >
            {t("msp.view.download_pdf")}
          </Button>
        </Group>
      </Group>

      {editing ? (
        <>
          <Accordion
            multiple
            defaultValue={[]}
            chevronPosition="left"
            variant="separated"
            className={classes.scroll}
          >
            {editFields.map(field => (
              <Accordion.Item key={field.key} value={field.key}>
                <Accordion.Control>
                  <Group justify="space-between" wrap="nowrap" gap="sm">
                    <Text size="sm" fw={600}>
                      {field.title}
                    </Text>
                    {isEmptyMspBody(bodies[field.key] ?? "") ? (
                      <Text size="xs" c="dimmed">
                        {t("msp.form.empty_section")}
                      </Text>
                    ) : (
                      <Text size="xs" c="dimmed">
                        {t("msp.form.filled_section")}
                      </Text>
                    )}
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <MspRichTextEditor
                    value={bodies[field.key] ?? ""}
                    placeholder={t("msp.form.body_placeholder")}
                    onChange={html =>
                      setBodies(prev => ({
                        ...prev,
                        [field.key]: html
                      }))
                    }
                  />
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
          <Group justify="flex-end" className={classes.footer}>
            <Button variant="default" onClick={cancelEdit} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => void onSave()}
              loading={saving}
              disabled={!title.trim()}
            >
              {t("common.save")}
            </Button>
          </Group>
        </>
      ) : msp.sections.length === 0 && childrenNodes.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t("msp.view.empty")}
        </Text>
      ) : (
        <Stack gap="sm" className={classes.scroll}>
          {msp.sections.length > 0 ? (
            <Accordion
              multiple
              defaultValue={[]}
              chevronPosition="left"
              variant="separated"
            >
              {msp.sections.map(section => (
                <Accordion.Item key={section.id} value={section.id}>
                  <Accordion.Control>
                    <Text size="sm" fw={600}>
                      {section.title}
                    </Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <MspRichTextView html={section.body ?? ""} />
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          ) : null}
          {childrenNodes.length > 0 ? (
            <>
              <Text size="sm" fw={600} mt={msp.sections.length > 0 ? "xs" : 0}>
                {t("msp.view.folder_items")}
              </Text>
              {childrenNodes.map(row => {
                const isFolder = row.ctype === "folder"
                const nav = childNav?.(row)
                const inner = (
                  <Group wrap="nowrap" gap="md" justify="space-between">
                    <Group wrap="nowrap" gap="md" style={{minWidth: 0}}>
                      <ThemeIcon
                        variant="light"
                        color={isFolder ? "yellow" : "gray"}
                        size="lg"
                        radius="md"
                        aria-hidden
                      >
                        {isFolder ? (
                          <IconFolder size={20} stroke={1.5} />
                        ) : (
                          <IconFile size={20} stroke={1.5} />
                        )}
                      </ThemeIcon>
                      <div style={{minWidth: 0}}>
                        <Text fw={600} size="md" truncate="end">
                          {formatNodeDisplayTitle(row.title, row.ctype)}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {isFolder
                            ? t("msp.view.item_folder")
                            : t("msp.view.item_document")}
                        </Text>
                      </div>
                    </Group>
                    <IconChevronRight
                      size={18}
                      stroke={1.5}
                      color="var(--mantine-color-dimmed)"
                      style={{flexShrink: 0}}
                      aria-hidden
                    />
                  </Group>
                )
                return (
                  <Paper key={row.id} withBorder p="md" radius="md">
                    {nav ? (
                      <Anchor
                        component={Link}
                        to={nav.to}
                        state={nav.state}
                        underline="never"
                        c="var(--mantine-color-text)"
                        display="block"
                      >
                        {inner}
                      </Anchor>
                    ) : (
                      inner
                    )}
                  </Paper>
                )
              })}
            </>
          ) : null}
        </Stack>
      )}
    </Stack>
  )
}

export function MspViewSkeleton() {
  return (
    <Stack gap="sm" mt="md">
      <Skeleton height={28} width="60%" />
      <Skeleton height={80} />
      <Skeleton height={80} />
    </Stack>
  )
}
