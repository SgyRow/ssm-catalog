import {useEffect, useState} from "react"

import {
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  LoadingOverlay,
  Modal,
  TextInput
} from "@mantine/core"

import {useEditTagMutation, useGetTagQuery} from "@/features/tags/apiSlice"
import {useTranslation} from "react-i18next"

interface Args {
  tagId: string
  onSubmit: () => void
  onCancel: () => void
  opened: boolean
}

export default function EditTagModal({
  onSubmit,
  onCancel,
  tagId,
  opened
}: Args) {
  const {t} = useTranslation()
  const {data} = useGetTagQuery(tagId)
  const [updateTag, {isLoading: isLoadingTagUpdate}] = useEditTagMutation()
  const [name, setName] = useState<string>("")
  const [description, setDescription] = useState<string>("")
  const [pinned, setPinned] = useState<boolean>(false)

  useEffect(() => {
    if (data && opened) {
      formReset()
    }
  }, [data, opened])

  const onLocalSubmit = async () => {
    const updatedTagData = {
      name: name.trim(),
      pinned,
      description: description.trim() || undefined,
      id: data!.id!
    }
    const tagData = data?.group_id
      ? {...updatedTagData, group_id: data.group_id}
      : updatedTagData

    await updateTag(tagData)
    formReset()
    onSubmit()
  }

  const onLocalCancel = () => {
    onCancel()
  }

  const formReset = () => {
    if (data) {
      setName(data.name || "")
      setDescription(data.description || "")
      setPinned(data.pinned || false)
    }
  }

  return (
    <Modal title={t("tags.edit.title")} opened={opened} onClose={onLocalCancel}>
      <Box>
        <LoadingOverlay
          visible={data == null}
          zIndex={1000}
          overlayProps={{radius: "sm", blur: 2}}
        />
        <TextInput
          label={t("tags.form.name")}
          value={name}
          onChange={e => setName(e.currentTarget.value)}
          placeholder={t("tags.form.name")}
        />
        <Checkbox
          onChange={e => setPinned(e.currentTarget.checked)}
          mt="sm"
          label={t("tags.form.pinned")}
          checked={pinned}
        />
        <TextInput
          mt="sm"
          label={t("tags.form.description")}
          value={description}
          placeholder={t("tags.form.description.placeholder")}
          onChange={e => setDescription(e.currentTarget.value)}
        />
        <Group justify="space-between" mt="md">
          <Button variant="default" onClick={onLocalCancel}>
            {t("common.cancel")}
          </Button>
          <Group>
            {isLoadingTagUpdate && <Loader size="sm" />}
            <Button disabled={isLoadingTagUpdate} onClick={onLocalSubmit}>
              {t("common.submit")}
            </Button>
          </Group>
        </Group>
      </Box>
    </Modal>
  )
}
