import {
  ActionIcon,
  Button,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Text,
  Tooltip
} from "@mantine/core"
import {useDisclosure} from "@mantine/hooks"
import {IconUsers} from "@tabler/icons-react"
import {useContext, useEffect, useMemo, useState} from "react"
import {useTranslation} from "react-i18next"

import {useAppDispatch, useAppSelector} from "@/app/hooks"
import PanelContext from "@/contexts/PanelContext"
import {
  useGetCitizenCategoriesQuery,
  useGetFolderCitizenCategoriesQuery,
  useSetFolderCitizenCategoriesMutation
} from "@/features/citizen_categories/citizenCategoriesApiSlice"
import {selectNodesByIds} from "@/features/nodes/nodesSlice"
import {
  commanderSelectionCleared,
  selectSelectedNodeIds
} from "@/features/ui/uiSlice"
import {CITIZEN_CATEGORY_UPDATE} from "@/scopes"
import {selectCurrentUser} from "@/slices/currentUser"
import type {NodeType, PanelMode} from "@/types"

function EditFolderCategoriesModal({
  opened,
  onClose,
  node
}: {
  opened: boolean
  onClose: () => void
  node: NodeType
}) {
  const {t} = useTranslation()
  const {data: allCategories, isLoading: catalogLoading} =
    useGetCitizenCategoriesQuery(undefined, {skip: !opened})
  const {data: assigned, isLoading: assignedLoading} =
    useGetFolderCitizenCategoriesQuery(node.id, {
      skip: !opened
    })
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [save, saveState] = useSetFolderCitizenCategoriesMutation()

  const categoryOptions = useMemo(
    () =>
      [...(allCategories ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: "base"}))
        .map(cat => ({value: cat.id, label: cat.name})),
    [allCategories]
  )

  const assignedKey = useMemo(
    () => (assigned ?? []).map(c => c.id).join("\0"),
    [assigned]
  )

  useEffect(() => {
    if (!opened) {
      setSelectedIds([])
      return
    }
    if (assignedLoading) {
      return
    }
    setSelectedIds(assignedKey ? assignedKey.split("\0") : [])
  }, [opened, assignedLoading, assignedKey])

  const onSubmit = async () => {
    await save({nodeId: node.id, categoryIds: selectedIds})
    onClose()
  }

  const loading = catalogLoading || assignedLoading

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("citizen_categories.assign_title")}
    >
      <Text size="sm" c="dimmed" mb="sm">
        {node.title}
      </Text>
      <MultiSelect
        label={t("citizen_categories.nav")}
        description={t("citizen_categories.assign_hint")}
        data={categoryOptions}
        value={selectedIds}
        onChange={setSelectedIds}
        searchable
        clearable
        nothingFoundMessage={t("citizen_categories.empty")}
        disabled={loading || categoryOptions.length === 0}
      />
      <Group justify="space-between" mt="md">
        <Button variant="default" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Group>
          {(loading || saveState.isLoading) && <Loader size="sm" />}
          <Button
            disabled={loading || saveState.isLoading}
            onClick={onSubmit}
          >
            {t("common.save")}
          </Button>
        </Group>
      </Group>
    </Modal>
  )
}

export default function EditFolderCategoriesButton() {
  const {t} = useTranslation()
  const [opened, {open, close}] = useDisclosure(false)
  const mode: PanelMode = useContext(PanelContext)
  const dispatch = useAppDispatch()
  const user = useAppSelector(selectCurrentUser)
  const scopes = user?.scopes ?? []
  const selectedIds = useAppSelector(s => selectSelectedNodeIds(s, mode))
  const selectedNodes = useAppSelector(s =>
    selectNodesByIds(s, selectedIds as string[])
  )

  if (!scopes.includes(CITIZEN_CATEGORY_UPDATE)) {
    return null
  }

  const folder = selectedNodes.find(n => n.ctype === "folder")
  if (!folder) {
    return null
  }

  const onClose = () => {
    dispatch(commanderSelectionCleared(mode))
    close()
  }

  return (
    <>
      <Tooltip label={t("citizen_categories.assign_title")} withArrow>
        <ActionIcon size="lg" variant="default" onClick={open}>
          <IconUsers stroke={1.4} />
        </ActionIcon>
      </Tooltip>
      <EditFolderCategoriesModal
        opened={opened}
        onClose={onClose}
        node={folder}
      />
    </>
  )
}
