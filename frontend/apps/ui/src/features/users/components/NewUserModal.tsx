import {useState} from "react"

import {
  Button,
  Checkbox,
  Group,
  Loader,
  LoadingOverlay,
  Modal,
  MultiSelect,
  TextInput
} from "@mantine/core"
import {useForm} from "@mantine/form"

import {UserEditableFields} from "@/types"

import {useGetRolesQuery} from "@/features/roles/apiSlice"
import {useAddNewUserMutation} from "@/features/users/apiSlice"
import {makeRandomString} from "@/utils"
import {useTranslation} from "react-i18next"
import {emailValidator, usernameValidator} from "./validators"

interface NewUserModalArgs {
  opened: boolean
  onSubmit: () => void
  onCancel: () => void
}

export default function NewUserModal({
  onCancel,
  onSubmit,
  opened
}: NewUserModalArgs) {
  const {t} = useTranslation()
  const {data: rolesData = []} = useGetRolesQuery()
  const [addNewUser, {isLoading, isSuccess}] = useAddNewUserMutation()

  const [roles, setRoles] = useState<string[]>([])

  const form = useForm<UserEditableFields>({
    mode: "uncontrolled",
    validate: {
      username: usernameValidator,
      email: emailValidator
    }
  })

  const onLocalSubmit = async (userFields: UserEditableFields) => {
    const role_ids = rolesData
      .filter(r => roles.includes(r.name))
      .map(r => r.id)
    const newUserData = {
      username: userFields.username,
      email: userFields.email,
      first_name: userFields.first_name || undefined,
      last_name: userFields.last_name || undefined,
      is_active: userFields.is_active || false,
      is_superuser: userFields.is_superuser || false,
      password: makeRandomString(24),
      scopes: [],
      group_ids: [],
      role_ids: role_ids
    }
    try {
      await addNewUser(newUserData).unwrap()
    } catch (err) {}

    onSubmit()
    reset()
  }

  const reset = () => {
    form.reset()
    setRoles([])
  }

  const onLocalCancel = () => {
    onCancel()
    reset()
  }

  return (
    <Modal title={t("users.new.title")} opened={opened} onClose={onLocalCancel}>
      <LoadingOverlay
        visible={false}
        zIndex={1000}
        overlayProps={{radius: "sm", blur: 2}}
      />
      <form onSubmit={form.onSubmit(onLocalSubmit)}>
        <TextInput
          label={t("users.form.username")}
          placeholder={t("users.form.username")}
          key={form.key("username")}
          {...form.getInputProps("username")}
        />
        <TextInput
          mt="sm"
          label={t("users.form.email")}
          type="email"
          placeholder={t("users.form.email")}
          key={form.key("email")}
          {...form.getInputProps("email")}
        />
        <TextInput
          mt="sm"
          label={t("users.form.first_name")}
          placeholder={t("users.form.first_name")}
          key={form.key("first_name")}
          {...form.getInputProps("first_name")}
        />
        <TextInput
          mt="sm"
          label={t("users.form.last_name")}
          placeholder={t("users.form.last_name")}
          key={form.key("last_name")}
          {...form.getInputProps("last_name")}
        />
        <Checkbox
          mt="sm"
          label={t("users.form.superuser")}
          key={form.key("is_superuser")}
          {...form.getInputProps("is_superuser", {type: "checkbox"})}
        />
        <Checkbox
          mt="sm"
          label={t("users.form.active")}
          key={form.key("is_active")}
          {...form.getInputProps("is_active", {type: "checkbox"})}
        />
        <MultiSelect
          mt="sm"
          label={t("users.form.roles")}
          placeholder={t("users.form.roles.placeholder")}
          onChange={setRoles}
          value={roles}
          data={rolesData.map(r => r.name) || []}
        />
        <Group justify="space-between" mt="md">
          <Button variant="default" onClick={onLocalCancel}>
            {t("common.cancel")}
          </Button>
          <Group>
            {isLoading && <Loader size="sm" />}
            <Button disabled={isLoading || isSuccess} type="submit">
              {t("common.submit")}
            </Button>
          </Group>
        </Group>
      </form>
    </Modal>
  )
}
