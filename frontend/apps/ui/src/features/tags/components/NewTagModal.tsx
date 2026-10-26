import {useEffect, useState} from "react"

import {useAddNewTagMutation} from "@/features/tags/apiSlice"
import {
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Text,
  TextInput
} from "@mantine/core"
import {useTranslation} from "react-i18next"

interface Args {
  opened: boolean
  onSubmit: () => void
  onCancel: () => void
}

export default function NewTagModal({onSubmit, onCancel, opened}: Args) {
  const {t} = useTranslation()
  const [addNewTag, {isLoading, isError, isSuccess}] = useAddNewTagMutation()
  const [name, setName] = useState<string>("")
  const [description, setDescription] = useState<string>("")
  const [pinned, setPinned] = useState<boolean>(false)
  const [error, setError] = useState<string>("")

  useEffect(() => {
    if (isSuccess) {
      onSubmit()
      reset()
    }
  }, [isSuccess, onSubmit])

  const onLocalSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t("tags.form.name_required"))
      return
    }

    try {
      await addNewTag({
        name: trimmed,
        pinned,
        description: description.trim() || undefined
      }).unwrap()
    } catch (err: unknown) {
      const detail = (err as {data?: {detail?: unknown}})?.data?.detail
      setError(
        typeof detail === "string"
          ? detail
          : detail
            ? JSON.stringify(detail)
            : String(err)
      )
    }
  }

  const onLocalCancel = () => {
    reset()
    onCancel()
  }

  const reset = () => {
    setName("")
    setDescription("")
    setPinned(false)
    setError("")
  }

  return (
    <Modal title={t("tags.new.title")} opened={opened} onClose={onLocalCancel}>
      <TextInput
        label={t("tags.form.name")}
        value={name}
        onChange={e => setName(e.currentTarget.value)}
        placeholder={t("tags.form.name")}
        required
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
        placeholder={t("tags.form.description.placeholder")}
        value={description}
        onChange={e => setDescription(e.currentTarget.value)}
      />
      {isError && error ? <Text c="red" mt="sm">{error}</Text> : null}
      <Group justify="space-between" mt="md">
        <Button variant="default" onClick={onLocalCancel}>
          {t("common.cancel")}
        </Button>
        <Group>
          {isLoading && <Loader size="sm" />}
          <Button disabled={isLoading} onClick={onLocalSubmit}>
            {t("common.submit")}
          </Button>
        </Group>
      </Group>
    </Modal>
  )
}
