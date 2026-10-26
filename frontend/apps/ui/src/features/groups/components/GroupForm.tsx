import CopyButton from "@/components/CopyButton"
import {Checkbox, TextInput} from "@mantine/core"

import type {GroupDetails} from "@/types.d/groups"
import {useTranslation} from "react-i18next"

type Args = {
  group: GroupDetails | null
}

export default function GroupModal({group}: Args) {
  const {t} = useTranslation()
  return (
    <div>
      <TextInput
        value={group?.name || ""}
        readOnly={true}
        label={t("groups.form.name")}
        rightSection={<CopyButton value={group?.name || ""} />}
      />
      <Checkbox
        my="md"
        checked={Boolean(group?.home_folder_id && group?.inbox_folder_id)}
        readOnly={true}
        label={t("groups.form.special_folders_readonly")}
      />
      {group?.home_folder_id && (
        <TextInput
          my="sm"
          value={group.home_folder_id}
          readOnly={true}
          label={t("groups.form.home_id")}
          rightSection={<CopyButton value={group?.home_folder_id || ""} />}
        />
      )}
      {group?.inbox_folder_id && (
        <TextInput
          my="sm"
          value={group.inbox_folder_id}
          readOnly={true}
          label={t("groups.form.inbox_id")}
          rightSection={<CopyButton value={group?.inbox_folder_id || ""} />}
        />
      )}
    </div>
  )
}
