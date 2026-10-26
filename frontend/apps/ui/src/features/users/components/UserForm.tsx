import CopyButton from "@/components/CopyButton"
import {Checkbox, MultiSelect, Stack, TextInput} from "@mantine/core"

import {UserDetails} from "@/types"
import {useTranslation} from "react-i18next"

type Args = {
  user: UserDetails | null
}

export default function UserForm({user}: Args) {
  const {t} = useTranslation()
  return (
    <Stack>
      <TextInput
        label={t("users.form.username")}
        value={user?.username || ""}
        onChange={() => {}}
        rightSection={<CopyButton value={user?.username || ""} />}
      />
      <TextInput
        label={t("users.form.email")}
        value={user?.email || ""}
        onChange={() => {}}
        rightSection={<CopyButton value={user?.email || ""} />}
      />
      <TextInput
        label={t("users.form.first_name")}
        value={user?.first_name || ""}
        onChange={() => {}}
      />
      <TextInput
        label={t("users.form.last_name")}
        value={user?.last_name || ""}
        onChange={() => {}}
      />
      <Checkbox
        label={t("users.form.superuser")}
        checked={user?.is_superuser}
        onChange={() => {}}
      />
      <Checkbox
        label={t("users.form.active")}
        checked={user?.is_active}
        onChange={() => {}}
      />
      <MultiSelect
        label={t("users.form.roles")}
        readOnly={true}
        value={user?.roles.map(r => r.name)}
      />
    </Stack>
  )
}
