import {useChangeOwnPasswordMutation} from "@/features/users/apiSlice"
import {Box, Button, Group, Loader, Modal, PasswordInput} from "@mantine/core"
import {useForm} from "@mantine/form"
import {useDisclosure} from "@mantine/hooks"
import {notifications} from "@mantine/notifications"
import {IconPassword} from "@tabler/icons-react"
import {useEffect} from "react"
import {useTranslation} from "react-i18next"

type PasswordFormValues = {
  currentPassword: string
  password: string
  confirmPassword: string
}

export default function ChangeOwnPasswordButton() {
  const {t} = useTranslation()
  const [opened, {open, close}] = useDisclosure(false)

  return (
    <>
      <Button
        leftSection={<IconPassword />}
        onClick={open}
        variant="default"
      >
        {t("common.change_password")}
      </Button>
      <ChangeOwnPasswordModal opened={opened} onClose={close} />
    </>
  )
}

interface ChangeOwnPasswordModalArgs {
  opened: boolean
  onClose: () => void
}

function ChangeOwnPasswordModal({opened, onClose}: ChangeOwnPasswordModalArgs) {
  const {t} = useTranslation()
  const [changeOwnPassword, {isLoading, reset}] = useChangeOwnPasswordMutation()

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      currentPassword: "",
      password: "",
      confirmPassword: ""
    },
    validate: {
      currentPassword: (value: string) =>
        value.length < 1 ? t("users.validation.current_password_empty") : null,
      confirmPassword: (value: string, values: PasswordFormValues) =>
        value !== values.password ? t("users.validation.password_mismatch") : null,
      password: (value: string) =>
        value.length < 1 ? t("users.validation.password_empty") : null
    }
  })

  useEffect(() => {
    if (opened) {
      form.reset()
      reset()
    }
  }, [opened])

  const handleClose = () => {
    form.reset()
    onClose()
  }

  const onSubmit = async ({
    currentPassword,
    password
  }: {
    currentPassword: string
    password: string
  }) => {
    try {
      await changeOwnPassword({
        current_password: currentPassword,
        password
      }).unwrap()
      notifications.show({
        title: t("profile.password_changed"),
        color: "green"
      })
      handleClose()
    } catch {
      notifications.show({
        title: t("profile.password_change_error"),
        color: "red"
      })
    }
  }

  return (
    <Modal
      title={t("common.change_password")}
      opened={opened}
      onClose={handleClose}
    >
      <Box>
        <form onSubmit={form.onSubmit(onSubmit)}>
          <PasswordInput
            label={t("users.form.current_password")}
            placeholder={t("users.form.current_password")}
            key={form.key("currentPassword")}
            {...form.getInputProps("currentPassword")}
          />
          <PasswordInput
            mt="sm"
            label={t("users.form.password")}
            placeholder={t("users.form.password")}
            key={form.key("password")}
            {...form.getInputProps("password")}
          />
          <PasswordInput
            mt="sm"
            label={t("users.form.confirm_password")}
            placeholder={t("users.form.confirm_password")}
            key={form.key("confirmPassword")}
            {...form.getInputProps("confirmPassword")}
          />
          <Group justify="space-between" mt="md">
            <Button variant="default" onClick={handleClose}>
              {t("common.cancel")}
            </Button>
            <Group>
              {isLoading && <Loader size="sm" />}
              <Button disabled={isLoading} type="submit">
                {t("common.submit")}
              </Button>
            </Group>
          </Group>
        </form>
      </Box>
    </Modal>
  )
}
