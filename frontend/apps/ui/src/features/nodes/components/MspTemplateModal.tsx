import {useCreateMspTemplateMutation} from "@/features/library/libraryApiSlice"
import {isFetchBaseQueryError} from "@/services/helpers"
import {Button, Group, Loader, Modal, Text, TextInput} from "@mantine/core"
import {notifications} from "@mantine/notifications"
import {ChangeEvent, useEffect, useRef, useState} from "react"
import {useTranslation} from "react-i18next"

type Args = {
  parent_id: string
  opened: boolean
  onSubmit: () => void
  onCancel: () => void
}

export const MspTemplateModal = ({
  parent_id,
  onSubmit,
  onCancel,
  opened
}: Args) => {
  const {t} = useTranslation()
  const [createMspTemplate, {isLoading, reset}] = useCreateMspTemplateMutation()
  const [title, setTitle] = useState("")
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (opened) {
      reset()
      setTitle("")
    }
  }, [opened, reset])

  useEffect(() => {
    document.addEventListener("keydown", handleKeydown, false)
    return () => {
      document.removeEventListener("keydown", handleKeydown, false)
    }
  }, [])

  const handleTitleChanged = (event: ChangeEvent<HTMLInputElement>) => {
    setTitle(event.currentTarget.value)
  }

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.code === "Enter" && ref.current) {
      ref.current.click()
    }
  }

  const onLocalSubmit = async () => {
    const trimmed = title.trim()
    if (!trimmed) {
      return
    }
    try {
      await createMspTemplate({parent_id, title: trimmed}).unwrap()
      setTitle("")
      reset()
      onSubmit()
    } catch (error) {
      let message = t("mspTemplate.error")
      if (isFetchBaseQueryError(error)) {
        const detail = error.data
        if (typeof detail === "string") {
          message = detail
        } else if (detail && typeof detail === "object" && "detail" in detail) {
          const nested = (detail as {detail: unknown}).detail
          if (typeof nested === "string") {
            message = nested
          } else if (nested && typeof nested === "object") {
            const messages = (nested as {messages?: string[]}).messages
            if (messages?.length) {
              const code = messages[0]
              if (code === "msp_template.duplicate_title") {
                message = t("mspTemplate.error.duplicate")
              } else if (code === "msp_template.root_not_empty") {
                message = t("mspTemplate.error.rootNotEmpty")
              } else {
                message = messages.join("; ")
              }
            }
          }
        }
      }
      notifications.show({title: message, color: "red"})
    }
  }

  const onLocalCancel = () => {
    setTitle("")
    reset()
    onCancel()
  }

  return (
    <Modal
      title={t("mspTemplate.title")}
      opened={opened}
      onClose={onLocalCancel}
    >
      <Text size="sm" c="dimmed">
        {t("mspTemplate.description")}
      </Text>
      <TextInput
        data-autofocus
        onChange={handleTitleChanged}
        label={t("mspTemplate.form.name")}
        placeholder={t("mspTemplate.form.placeholder")}
        mt="md"
        value={title}
      />
      <Group justify="space-between" mt="md">
        <Button variant="default" onClick={onLocalCancel}>
          {t("common.cancel")}
        </Button>
        <Group>
          {isLoading && <Loader size="sm" />}
          <Button
            ref={ref}
            disabled={isLoading || !title.trim()}
            onClick={onLocalSubmit}
          >
            {t("common.submit")}
          </Button>
        </Group>
      </Group>
    </Modal>
  )
}
