import {
  Button,
  Group,
  Modal,
  MultiSelect,
  Radio,
  Stack,
  Text
} from "@mantine/core"
import {useEffect, useState} from "react"
import {useTranslation} from "react-i18next"

import {
  useGetNodeVisibilityQuery,
  useUpdateNodeVisibilityMutation,
  type UpdateNodeVisibility
} from "@/features/nodes/apiSlice"
import {useGetRolesQuery} from "@/features/roles/apiSlice"

type Props = {
  opened: boolean
  onClose: () => void
  nodeID: string
}

export default function EditNodeVisibilityModal({
  opened,
  onClose,
  nodeID
}: Props) {
  const {t} = useTranslation()
  const {data: visibility, isLoading} = useGetNodeVisibilityQuery(nodeID, {
    skip: !opened
  })
  const {data: roles = []} = useGetRolesQuery(undefined, {skip: !opened})
  const [updateVisibility, {isLoading: saving}] =
    useUpdateNodeVisibilityMutation()

  const [mode_, setMode] = useState<"inherit" | "private" | "public" | "role_based">(
    "inherit"
  )
  const [roleIds, setRoleIds] = useState<string[]>([])

  useEffect(() => {
    if (!visibility) {
      return
    }
    if (visibility.inherit) {
      setMode("inherit")
    } else {
      setMode(visibility.access_level)
    }
    setRoleIds(visibility.role_ids.map(String))
  }, [visibility])

  const onSave = async () => {
    const body: UpdateNodeVisibility =
      mode_ === "inherit"
        ? {inherit: true}
        : {
            inherit: false,
            access_level: mode_,
            role_ids: mode_ === "role_based" ? roleIds : []
          }
    await updateVisibility({nodeID, body})
    onClose()
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("node.visibility.title")}
    >
      <Stack gap="md">
        {isLoading && <Text size="sm">{t("common.loading")}</Text>}
        {visibility && (
          <Text size="sm" c="dimmed">
            {t("node.visibility.effective", {
              level: t(`node.visibility.level.${visibility.effective_access_level}`)
            })}
          </Text>
        )}
        <Radio.Group
          value={mode_}
          onChange={v => setMode(v as typeof mode_)}
          label={t("node.visibility.mode_label")}
        >
          <Stack gap="xs" mt="xs">
            <Radio value="inherit" label={t("node.visibility.inherit")} />
            <Radio value="private" label={t("node.visibility.private")} />
            <Radio value="public" label={t("node.visibility.public")} />
            <Radio value="role_based" label={t("node.visibility.role_based")} />
          </Stack>
        </Radio.Group>
        {mode_ === "role_based" && (
          <MultiSelect
            label={t("node.visibility.roles_label")}
            data={roles.map(r => ({value: r.id, label: r.name}))}
            value={roleIds}
            onChange={setRoleIds}
            searchable
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={saving} onClick={onSave}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
