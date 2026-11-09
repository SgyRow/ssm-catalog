import {
  Box,
  Button,
  Group,
  Modal,
  ScrollArea,
  Text,
  CheckedNodeStatus
} from "@mantine/core"
import RoleForm from "../RoleForm"
import SubmitButton from "../SubmitButton/SubmitButton"
import type {I18NRoleFormModal} from "./types"

interface Args {
  txt?: I18NRoleFormModal
  error?: string
  initialCheckedState: string[]
  title: string
  name?: string // i.e. field "name" from the role form
  opened: boolean
  inProgress: boolean
  onPermissionsChange?: (checkedPermissions: CheckedNodeStatus[]) => void
  onNameChange?: (value: string) => void
  onSubmit?: () => void
  onCancel?: () => void
}

const EmptyFunc = () => {}

export default function RoleFormModal({
  txt,
  inProgress,
  title,
  opened,
  name,
  error,
  initialCheckedState,
  onPermissionsChange,
  onNameChange,
  onCancel,
  onSubmit
}: Args) {
  return (
    <Modal
      title={title}
      opened={opened}
      size="lg"
      onClose={onCancel || EmptyFunc}
    >
      <Box
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%"
        }}
      >
        <ScrollArea style={{flex: 1, minHeight: 0}} mah="70dvh">
          <RoleForm
            name={name}
            isLoading={inProgress}
            withScrollArea={false}
            txt={txt?.roleForm}
            initialCheckedState={initialCheckedState}
            onPermissionsChange={onPermissionsChange}
            onNameChange={onNameChange}
          />
        </ScrollArea>
        <Box
          pt="sm"
          mt="sm"
          style={{
            borderTop: "1px solid light-dark(#e0e0e0, var(--mantine-color-dark-4))",
            flexShrink: 0
          }}
        >
          {error ? <Text c="red">{error}</Text> : null}
          <Group gap="lg" justify="space-between">
            <Button variant="default" onClick={onCancel}>
              {txt?.cancel || "Cancel"}
            </Button>
            <SubmitButton
              onClick={onSubmit}
              inProgress={inProgress}
              text={txt?.submit || "Submit"}
            />
          </Group>
        </Box>
      </Box>
    </Modal>
  )
}
