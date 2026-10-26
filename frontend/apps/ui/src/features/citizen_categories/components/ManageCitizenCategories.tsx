import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip
} from "@mantine/core"
import {useDisclosure} from "@mantine/hooks"
import {IconPencil, IconPlus, IconTrash} from "@tabler/icons-react"
import {useEffect, useState} from "react"
import {useTranslation} from "react-i18next"

import {
  useCreateCitizenCategoryMutation,
  useDeleteCitizenCategoryMutation,
  useUpdateCitizenCategoryMutation,
  type CitizenCategory
} from "@/features/citizen_categories/citizenCategoriesApiSlice"
import {
  CITIZEN_CATEGORY_CREATE,
  CITIZEN_CATEGORY_DELETE,
  CITIZEN_CATEGORY_UPDATE
} from "@/scopes"
import {useAppSelector} from "@/app/hooks"
import {selectCurrentUser} from "@/slices/currentUser"

type FormState = {
  name: string
  description: string
}

function emptyForm(): FormState {
  return {name: "", description: ""}
}

function CategoryFormModal({
  opened,
  onClose,
  initial,
  categoryId
}: {
  opened: boolean
  onClose: () => void
  initial?: FormState
  categoryId?: string
}) {
  const {t} = useTranslation()
  const [form, setForm] = useState<FormState>(initial ?? emptyForm())
  const [create, createState] = useCreateCitizenCategoryMutation()
  const [update, updateState] = useUpdateCitizenCategoryMutation()

  const isEdit = Boolean(categoryId)
  const busy = createState.isLoading || updateState.isLoading

  useEffect(() => {
    if (opened) {
      setForm(initial ?? emptyForm())
    }
  }, [opened, initial])

  const onSubmit = async () => {
    const name = form.name.trim()
    if (!name) {
      return
    }
    if (isEdit && categoryId) {
      await update({
        id: categoryId,
        name,
        description: form.description.trim() || null
      })
    } else {
      await create({
        name,
        description: form.description.trim() || null
      })
    }
    onClose()
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        isEdit
          ? t("citizen_categories.edit_title")
          : t("citizen_categories.create_title")
      }
    >
      <Stack>
        <TextInput
          label={t("citizen_categories.name")}
          value={form.name}
          onChange={e => {
            const name = e.currentTarget.value
            setForm(f => ({...f, name}))
          }}
          required
        />
        <Textarea
          label={t("citizen_categories.description")}
          value={form.description}
          onChange={e => {
            const description = e.currentTarget.value
            setForm(f => ({...f, description}))
          }}
          minRows={2}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={onSubmit} loading={busy} disabled={!form.name.trim()}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

export default function ManageCitizenCategoriesToolbar() {
  const {t} = useTranslation()
  const user = useAppSelector(selectCurrentUser)
  const scopes = user?.scopes ?? []
  const canCreate = scopes.includes(CITIZEN_CATEGORY_CREATE)
  const canUpdate = scopes.includes(CITIZEN_CATEGORY_UPDATE)
  const canDelete = scopes.includes(CITIZEN_CATEGORY_DELETE)

  const [createOpened, createHandlers] = useDisclosure(false)
  const [editTarget, setEditTarget] = useState<CitizenCategory | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CitizenCategory | null>(null)
  const [deleteCategory, deleteState] = useDeleteCitizenCategoryMutation()

  if (!canCreate && !canUpdate && !canDelete) {
    return null
  }

  return (
    <>
      <Group justify="space-between" align="flex-end">
        <Title order={3}>{t("citizen_categories.nav")}</Title>
        {canCreate ? (
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={createHandlers.open}
          >
            {t("citizen_categories.create_title")}
          </Button>
        ) : null}
      </Group>

      {canCreate ? (
        <CategoryFormModal
          opened={createOpened}
          onClose={createHandlers.close}
        />
      ) : null}

      {editTarget && canUpdate ? (
        <CategoryFormModal
          opened
          onClose={() => setEditTarget(null)}
          categoryId={editTarget.id}
          initial={{
            name: editTarget.name,
            description: editTarget.description ?? ""
          }}
        />
      ) : null}

      <Modal
        opened={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={t("citizen_categories.delete_title")}
      >
        <Stack>
          <Text>{t("citizen_categories.delete_confirm")}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              color="red"
              loading={deleteState.isLoading}
              onClick={async () => {
                if (deleteTarget) {
                  await deleteCategory(deleteTarget.id)
                  setDeleteTarget(null)
                }
              }}
            >
              {t("common.delete")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

export function CitizenCategoryRowActions({
  category
}: {
  category: CitizenCategory
}) {
  const {t} = useTranslation()
  const user = useAppSelector(selectCurrentUser)
  const scopes = user?.scopes ?? []
  const canUpdate = scopes.includes(CITIZEN_CATEGORY_UPDATE)
  const canDelete = scopes.includes(CITIZEN_CATEGORY_DELETE)
  const [editOpened, editHandlers] = useDisclosure(false)
  const [deleteOpened, deleteHandlers] = useDisclosure(false)
  const [deleteCategory, deleteState] = useDeleteCitizenCategoryMutation()

  if (!canUpdate && !canDelete) {
    return null
  }

  return (
    <>
      <Group gap={4} wrap="nowrap">
        {canUpdate ? (
          <Tooltip label={t("common.edit")}>
            <ActionIcon variant="subtle" onClick={editHandlers.open}>
              <IconPencil size={16} />
            </ActionIcon>
          </Tooltip>
        ) : null}
        {canDelete ? (
          <Tooltip label={t("common.delete")}>
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={deleteHandlers.open}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        ) : null}
      </Group>

      {canUpdate ? (
        <CategoryFormModal
          opened={editOpened}
          onClose={editHandlers.close}
          categoryId={category.id}
          initial={{
            name: category.name,
            description: category.description ?? ""
          }}
        />
      ) : null}

      {canDelete ? (
        <Modal
          opened={deleteOpened}
          onClose={deleteHandlers.close}
          title={t("citizen_categories.delete_title")}
        >
          <Stack>
            <Text>{t("citizen_categories.delete_confirm")}</Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={deleteHandlers.close}>
                {t("common.cancel")}
              </Button>
              <Button
                color="red"
                loading={deleteState.isLoading}
                onClick={async () => {
                  await deleteCategory(category.id)
                  deleteHandlers.close()
                }}
              >
                {t("common.delete")}
              </Button>
            </Group>
          </Stack>
        </Modal>
      ) : null}
    </>
  )
}
