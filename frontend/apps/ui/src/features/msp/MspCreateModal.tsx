import {
  useCreateMspMutation,
  useCreateMspTypeMutation,
  useDeleteMspTypeMutation,
  useListMspTypesQuery,
  useAddMspTypeSectionMutation,
  type MspType
} from "@/features/msp/mspApiSlice"
import {isFetchBaseQueryError} from "@/services/helpers"
import {selectCurrentUser} from "@/slices/currentUser"
import type {UserDetails} from "@/types"
import {
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
import {useMemo, useState} from "react"
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
      size="lg"
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
    s => (bodies[s.id] ?? "").trim().length > 0
  ).length

  const canSubmit =
    !!typeId && title.trim().length > 0 && filledCount > 0 && !isLoading

  const onSubmit = async () => {
    if (!type) {
      return
    }
    const sectionInputs = sections
      .filter(s => (bodies[s.id] ?? "").trim().length > 0)
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
          <Stack gap="sm">
            {sections.map(section => (
              <div key={section.id}>
                <Text size="xs" fw={500} c="dimmed">
                  {section.title}
                </Text>
                <Textarea
                  mt="xs"
                  autosize
                  minRows={2}
                  placeholder={t("msp.form.body_placeholder")}
                  value={bodies[section.id] ?? ""}
                  onChange={e =>
                    onBodyChange(section.id, e.currentTarget.value)
                  }
                />
              </div>
            ))}
          </Stack>
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
  const [deleteType, {isLoading: deleting}] = useDeleteMspTypeMutation()
  const [addSection, {isLoading: addingSection}] = useAddMspTypeSectionMutation()

  const [pendingAdd, setPendingAdd] = useState<Record<string, string>>({})

  const onAddSection = async (type: MspType) => {
    const title = (pendingAdd[type.id] ?? "").trim()
    if (!title) {
      return
    }
    try {
      await addSection({msp_type_id: type.id, title}).unwrap()
      setPendingAdd(prev => ({...prev, [type.id]: ""}))
    } catch (error) {
      notifications.show({
        title: t("msp.types.add_section_error"),
        message: errMsg(t, error, "msp.types.add_section_error"),
        color: "red"
      })
    }
  }

  const onDelete = async (type: MspType) => {
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

  if (types.length === 0) {
    return <Text size="sm" c="dimmed">{t("msp.types.empty")}</Text>
  }

  return (
    <Stack gap="sm">
      {types.map(type => (
        <Paper key={type.id} withBorder p="md" radius="md">
          <Group justify="space-between" align="flex-start" gap="sm">
            <div style={{minWidth: 0}}>
              <Text fw={600}>{type.name}</Text>
              {type.description ? (
                <Text size="xs" c="dimmed">
                  {type.description}
                </Text>
              ) : null}
              <Group gap="xs" mt="xs">
                {type.sections.map(s => (
                  <Text key={s.id} size="xs" c="dimmed">
                    {s.title}
                  </Text>
                ))}
              </Group>
            </div>
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={() => onDelete(type)}
              disabled={deleting}
              aria-label={t("msp.types.delete")}
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>
          <Group gap="xs" mt="sm">
            <TextInput
              style={{flex: 1}}
              size="xs"
              placeholder={t("msp.types.add_section_placeholder")}
              value={pendingAdd[type.id] ?? ""}
              onChange={e =>
                setPendingAdd(prev => ({...prev, [type.id]: e.currentTarget.value}))
              }
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void onAddSection(type)
                }
              }}
            />
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={() => onAddSection(type)}
              disabled={
                addingSection || (pendingAdd[type.id] ?? "").trim().length === 0
              }
            >
              {t("msp.types.add_section")}
            </Button>
          </Group>
        </Paper>
      ))}
    </Stack>
  )
}
