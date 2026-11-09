import {isEmptyMspBody} from "@/features/msp/html"
import {MspRichTextEditor} from "@/features/msp/MspRichText"
import {
  useCreateMspMutation,
  useCreateMspTypeMutation,
  useDeleteMspTypeMutation,
  useUpdateMspTypeMutation,
  useListMspTypesQuery,
  type MspType
} from "@/features/msp/mspApiSlice"
import {isFetchBaseQueryError} from "@/services/helpers"
import {selectCurrentUser} from "@/slices/currentUser"
import type {UserDetails} from "@/types"
import {
  Accordion,
  ActionIcon,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput
} from "@mantine/core"
import {notifications} from "@mantine/notifications"
import {IconPlus, IconTrash} from "@tabler/icons-react"
import {useEffect, useMemo, useState} from "react"
import {useSelector} from "react-redux"
import {useTranslation} from "react-i18next"

type Args = {
  parent_id: string
  opened: boolean
  onSubmit: () => void
  onCancel: () => void
}

function errMsg(
  t: (k: string) => string,
  error: unknown,
  fallbackKey: string
): string {
  let message = t(fallbackKey)
  if (isFetchBaseQueryError(error)) {
    const detail = error.data
    if (typeof detail === "string") {
      message = detail
    } else if (detail && typeof detail === "object" && "detail" in detail) {
      const d = (detail as {detail: unknown}).detail
      if (typeof d === "string") {
        message = d
      } else if (d && typeof d === "object") {
        const messages = (d as {messages?: string[]}).messages
        if (messages?.length) {
          message = messages.join("; ")
        }
      }
    }
  }
  return message
}

export default function MspCreateModal({
  parent_id,
  opened,
  onSubmit,
  onCancel
}: Args) {
  const {t} = useTranslation()
  const user = useSelector(selectCurrentUser) as UserDetails | null
  const isSuperuser = Boolean(user?.is_superuser)

  const [tab, setTab] = useState<"new" | "types">("new")

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={t("msp.title")}
      size="xl"
    >
      <Tabs value={tab} onChange={v => setTab(v as "new" | "types")}>
        <Tabs.List>
          <Tabs.Tab value="new">
            {t("msp.tab_create")}
          </Tabs.Tab>
          {isSuperuser ? (
            <Tabs.Tab value="types">{t("msp.tab_types")}</Tabs.Tab>
          ) : null}
        </Tabs.List>

        <Tabs.Panel value="new" pt="md">
          <CreateMspTab
            parent_id={parent_id}
            onDone={onSubmit}
            onCancel={onCancel}
          />
        </Tabs.Panel>

        {isSuperuser ? (
          <Tabs.Panel value="types" pt="md">
            <TypesTab />
          </Tabs.Panel>
        ) : null}
      </Tabs>
    </Modal>
  )
}

// --------------------------------------------------------------------------- #
// Tab 1 — create a measure
// --------------------------------------------------------------------------- #
function CreateMspTab({
  parent_id,
  onDone,
  onCancel
}: {
  parent_id: string
  onDone: () => void
  onCancel: () => void
}) {
  const {t} = useTranslation()
  const {data: types} = useListMspTypesQuery()
  const [createMsp, {isLoading}] = useCreateMspMutation()

  const [typeId, setTypeId] = useState<string>("")
  const [title, setTitle] = useState("")
  const [bodies, setBodies] = useState<Record<string, string>>({})

  const type = useMemo(
    () => (types ?? []).find(x => x.id === typeId) ?? null,
    [types, typeId]
  )

  const sections = type?.sections ?? []

  const onTypeChange = (value: string | null) => {
    const next = value ?? ""
    setTypeId(next)
    // Reset the bodies: keep only sections of the newly selected type.
    const nextMap: Record<string, string> = {}
    const nextType = (types ?? []).find(x => x.id === next)
    for (const s of nextType?.sections ?? []) {
      nextMap[s.id] = ""
    }
    setBodies(nextMap)
  }

  const onBodyChange = (sectionId: string, value: string) => {
    setBodies(prev => ({...prev, [sectionId]: value}))
  }

  const filledCount = sections.filter(
    s => !isEmptyMspBody(bodies[s.id] ?? "")
  ).length

  const canSubmit =
    !!typeId && title.trim().length > 0 && filledCount > 0 && !isLoading

  const onSubmit = async () => {
    if (!type) {
      return
    }
    const sectionInputs = sections
      .filter(s => !isEmptyMspBody(bodies[s.id] ?? ""))
      .map(s => ({type_section_id: s.id, body: bodies[s.id]}))
    try {
      await createMsp({
        parent_id,
        title: title.trim(),
        msp_type_id: typeId,
        sections: sectionInputs
      }).unwrap()
      setTitle("")
      setBodies({})
      setTypeId("")
      onDone()
    } catch (error) {
      notifications.show({
        title: t("msp.error.create"),
        message: errMsg(t, error, "msp.error.create"),
        color: "red"
      })
    }
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {t("msp.create_hint")}
      </Text>

      <Select
        label={t("msp.form.type")}
        placeholder={t("msp.form.type_placeholder")}
        data={(types ?? []).map(x => ({value: x.id, label: x.name}))}
        value={typeId || null}
        onChange={onTypeChange}
        searchable
        clearable
      />

      <TextInput
        label={t("msp.form.title")}
        placeholder={t("msp.form.title_placeholder")}
        value={title}
        onChange={e => setTitle(e.currentTarget.value)}
      />

      {type ? (
        <div>
          <Text size="sm" c="dimmed" mb="xs">
            {t("msp.form.sections_hint")}
          </Text>
          <Accordion
            key={typeId}
            multiple
            defaultValue={[]}
            chevronPosition="left"
            variant="separated"
          >
            {sections.map(section => (
              <Accordion.Item key={section.id} value={section.id}>
                <Accordion.Control>
                  <Group justify="space-between" wrap="nowrap" gap="sm">
                    <Text size="sm" fw={600}>
                      {section.title}
                    </Text>
                    {isEmptyMspBody(bodies[section.id] ?? "") ? (
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
                    value={bodies[section.id] ?? ""}
                    placeholder={t("msp.form.body_placeholder")}
                    onChange={html => onBodyChange(section.id, html)}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </div>
      ) : (
        <Text size="sm" c="dimmed">
          {t("msp.form.no_type")}
        </Text>
      )}

      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Group>
          {isLoading && <Loader size="sm" />}
          <Button disabled={!canSubmit} onClick={onSubmit}>
            {t("common.submit")}
          </Button>
        </Group>
      </Group>
    </Stack>
  )
}

// --------------------------------------------------------------------------- #
// Tab 2 — manage measure types (admin)
// --------------------------------------------------------------------------- #
function TypesTab() {
  const {data: types} = useListMspTypesQuery()

  return (
    <Stack gap="lg">
      <CreateTypeForm />
      <Divider />
      <ExistingTypesList types={types ?? []} />
    </Stack>
  )
}

function CreateTypeForm() {
  const {t} = useTranslation()
  const [createType, {isLoading}] = useCreateMspTypeMutation()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [sections, setSections] = useState<string[]>([""])

  const onSectionChange = (idx: number, value: string) => {
    setSections(prev => prev.map((s, i) => (i === idx ? value : s)))
  }

  const onSectionRemove = (idx: number) => {
    setSections(prev => prev.filter((_, i) => i !== idx))
  }

  const onSectionAdd = () => {
    setSections(prev => [...prev, ""])
  }

  const validSections = sections.map(s => s.trim()).filter(Boolean)
  const canSubmit =
    name.trim().length > 0 && validSections.length > 0 && !isLoading

  const onSubmit = async () => {
    try {
      await createType({
        name: name.trim(),
        description: description.trim() || null,
        sections: validSections.map(title => ({title}))
      }).unwrap()
      setName("")
      setDescription("")
      setSections([""])
      notifications.show({message: t("msp.types.created"), color: "green"})
    } catch (error) {
      notifications.show({
        title: t("msp.types.create_error"),
        message: errMsg(t, error, "msp.types.create_error"),
        color: "red"
      })
    }
  }

  return (
    <Paper withBorder p="md" radius="md">
      <Text fw={600} mb="sm">
        {t("msp.types.new")}
      </Text>
      <Stack gap="sm">
        <TextInput
          label={t("msp.types.form.name")}
          placeholder={t("msp.types.form.name_placeholder")}
          value={name}
          onChange={e => setName(e.currentTarget.value)}
        />
        <TextInput
          label={t("msp.types.form.description")}
          placeholder={t("msp.types.form.description_placeholder")}
          value={description}
          onChange={e => setDescription(e.currentTarget.value)}
        />
        <div>
          <Text size="xs" c="dimmed" mb="xs">
            {t("msp.types.form.sections")}
          </Text>
          <Stack gap="xs">
            {sections.map((section, idx) => (
              <Group key={idx} gap="xs">
                <TextInput
                  style={{flex: 1}}
                  placeholder={t("msp.types.form.section_placeholder")}
                  value={section}
                  onChange={e => onSectionChange(idx, e.currentTarget.value)}
                />
                {sections.length > 1 ? (
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => onSectionRemove(idx)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                ) : null}
              </Group>
            ))}
          </Stack>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlus size={14} />}
            mt="xs"
            onClick={onSectionAdd}
          >
            {t("msp.types.form.add_section")}
          </Button>
        </div>
        <Group justify="flex-end">
          <Button
            disabled={!canSubmit}
            loading={isLoading}
            onClick={onSubmit}
          >
            {t("msp.types.create")}
          </Button>
        </Group>
      </Stack>
    </Paper>
  )
}

function ExistingTypesList({types}: {types: MspType[]}) {
  const {t} = useTranslation()

  if (types.length === 0) {
    return <Text size="sm" c="dimmed">{t("msp.types.empty")}</Text>
  }

  return (
    <Accordion variant="separated" radius="md" chevronPosition="left">
      {types.map(type => (
        <Accordion.Item key={type.id} value={type.id}>
          <Accordion.Control>
            <Group justify="space-between" wrap="nowrap" gap="sm" pe="xs">
              <div style={{minWidth: 0}}>
                <Text fw={600} truncate="end">
                  {type.name}
                </Text>
                {type.description ? (
                  <Text size="xs" c="dimmed" truncate="end">
                    {type.description}
                  </Text>
                ) : null}
              </div>
              <Text size="xs" c="dimmed" style={{flexShrink: 0}}>
                {t("msp.types.section_count", {
                  count: type.sections.length
                })}
              </Text>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <TypeEditorCard type={type} />
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  )
}

type DraftSection = {key: string; id?: string; title: string}

function TypeEditorCard({type}: {type: MspType}) {
  const {t} = useTranslation()
  const [deleteType, {isLoading: deleting}] = useDeleteMspTypeMutation()
  const [updateType, {isLoading: saving}] = useUpdateMspTypeMutation()

  const [name, setName] = useState(type.name)
  const [description, setDescription] = useState(type.description ?? "")
  const [sections, setSections] = useState<DraftSection[]>(() =>
    type.sections.map(s => ({key: s.id, id: s.id, title: s.title}))
  )

  const syncFromType = () => {
    setName(type.name)
    setDescription(type.description ?? "")
    setSections(type.sections.map(s => ({key: s.id, id: s.id, title: s.title})))
  }

  useEffect(() => {
    syncFromType()
    // Reset local draft when the server copy changes (after save/refetch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type.id, type.updated_at])

  const onSectionChange = (key: string, value: string) => {
    setSections(prev => prev.map(s => (s.key === key ? {...s, title: value} : s)))
  }

  const onSectionRemove = (key: string) => {
    setSections(prev => prev.filter(s => s.key !== key))
  }

  const onSectionAdd = () => {
    setSections(prev => [
      ...prev,
      {key: `new-${Date.now()}-${prev.length}`, title: ""}
    ])
  }

  const validSections = sections
    .map(s => ({...s, title: s.title.trim()}))
    .filter(s => s.title.length > 0)

  const canSave =
    name.trim().length > 0 && validSections.length > 0 && !saving && !deleting

  const onSave = async () => {
    try {
      await updateType({
        msp_type_id: type.id,
        name: name.trim(),
        description: description.trim(),
        sections: validSections.map(s => ({
          id: s.id,
          title: s.title
        }))
      }).unwrap()
      notifications.show({message: t("msp.types.saved"), color: "green"})
    } catch (error) {
      notifications.show({
        title: t("msp.types.save_error"),
        message: errMsg(t, error, "msp.types.save_error"),
        color: "red"
      })
    }
  }

  const onDelete = async () => {
    try {
      await deleteType(type.id).unwrap()
      notifications.show({message: t("msp.types.deleted"), color: "green"})
    } catch (error) {
      notifications.show({
        title: t("msp.types.delete_error"),
        message: errMsg(t, error, "msp.types.delete_error"),
        color: "red"
      })
    }
  }

  return (
    <Stack gap="sm">
        <TextInput
          label={t("msp.types.form.name")}
          value={name}
          onChange={e => setName(e.currentTarget.value)}
        />
        <TextInput
          label={t("msp.types.form.description")}
          value={description}
          onChange={e => setDescription(e.currentTarget.value)}
        />
        <div>
          <Text size="xs" c="dimmed" mb="xs">
            {t("msp.types.form.sections")}
          </Text>
          <Stack gap="xs">
            {sections.map(section => (
              <Group key={section.key} gap="xs">
                <TextInput
                  style={{flex: 1}}
                  placeholder={t("msp.types.form.section_placeholder")}
                  value={section.title}
                  onChange={e =>
                    onSectionChange(section.key, e.currentTarget.value)
                  }
                />
                <ActionIcon
                  variant="subtle"
                  color="red"
                  onClick={() => onSectionRemove(section.key)}
                  aria-label={t("msp.types.delete_section")}
                  disabled={sections.length <= 1}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlus size={14} />}
            mt="xs"
            onClick={onSectionAdd}
          >
            {t("msp.types.form.add_section")}
          </Button>
        </div>
        <Group justify="space-between">
          <Button
            variant="subtle"
            color="red"
            size="xs"
            leftSection={<IconTrash size={14} />}
            onClick={() => void onDelete()}
            disabled={deleting || saving}
          >
            {t("msp.types.delete")}
          </Button>
          <Group gap="xs">
            <Button variant="default" size="xs" onClick={syncFromType}>
              {t("common.cancel")}
            </Button>
            <Button
              size="xs"
              disabled={!canSave}
              loading={saving}
              onClick={() => void onSave()}
            >
              {t("common.save")}
            </Button>
          </Group>
        </Group>
    </Stack>
  )
}
