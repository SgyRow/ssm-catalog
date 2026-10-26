import {useEffect, useState} from "react"

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

import {useEditUserMutation, useGetUserQuery} from "@/features/users/apiSlice"
import {UserEditableFields} from "@/types"

import {useGetRolesQuery} from "@/features/roles/apiSlice"
import {useTranslation} from "react-i18next"

interface EditUserModalArgs {
  opened: boolean
  userId: string
  onSubmit: () => void
  onCancel: () => void
}

export default function EditUserModal({
  userId,
  onCancel,
  onSubmit,
  opened
}: EditUserModalArgs) {
  const {t} = useTranslation()
  const {data: allRoles = []} = useGetRolesQuery()
  const {data, isLoading, isSuccess} = useGetUserQuery(userId)
  const [updateUser, {isLoading: isLoadingUserUpdate}] = useEditUserMutation()

  const [roles, setRoles] = useState<string[]>(
    data?.roles.map(r => r.name) || []
  )

  const form = useForm<UserEditableFields>({
    mode: "uncontrolled"
  })

  useEffect(() => {
    if (isSuccess) {
      resetForm()
    }
  }, [isLoading, data, opened])

  const resetForm = () => {
    if (data) {
      form.setValues({
        username: data.username,
        email: data.email,
        first_name: data.first_name || "",
        last_name: data.last_name || "",
        is_active: data.is_active,
        is_superuser: data.is_superuser,
        roles: data.roles.map(r => r.name)
      })
    }

    setRoles(data?.roles.map(r => r.name) || [])
  }

  const onLocalSubmit = async (userFields: UserEditableFields) => {
    const group_ids = data?.groups.map(g => g.id) || []
    const role_ids = allRoles.filter(r => roles.includes(r.name)).map(r => r.id)

    const updatedData = {
      id: userId,
      username: userFields.username,
      email: userFields.email,
      first_name: userFields.first_name,
      last_name: userFields.last_name,
      is_active: userFields.is_active,
      is_superuser: userFields.is_superuser,
      group_ids: group_ids,
      role_ids: role_ids
    }
    try {
      await updateUser(updatedData).unwrap()
    } catch (err) {}

    onSubmit()
  }
  const onClose = () => {
    onCancel()
  }

  return (
    <Modal title={t("users.edit.title")} opened={opened} onClose={onClose}>
      <LoadingOverlay
        visible={isLoading}
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
          label={t("users.form.roles")}
          placeholder={t("common.pick_value")}
          onChange={setRoles}
          value={roles}
          data={allRoles.map(r => r.name) || []}
        />
        <Group justify="space-between" mt="md">
          <Button variant="default" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Group>
            {isLoadingUserUpdate && <Loader size="sm" />}
            <Button disabled={isLoadingUserUpdate} type="submit">
              {t("common.submit")}
            </Button>
          </Group>
        </Group>
      </form>
    </Modal>
  )
}
