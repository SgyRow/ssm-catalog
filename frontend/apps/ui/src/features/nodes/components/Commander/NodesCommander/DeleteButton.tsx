import {useDisclosure} from "@mantine/hooks"
import {useContext} from "react"
import {useTranslation} from "react-i18next"

import {useAppDispatch, useAppSelector} from "@/app/hooks"
import {PanelMode} from "@/types"
import {ActionIcon, Tooltip} from "@mantine/core"
import {IconTrash} from "@tabler/icons-react"
import DeleteNodesModal from "./DeleteModal"

import {
  commanderSelectionCleared,
  selectSelectedNodeIds
} from "@/features/ui/uiSlice"

import PanelContext from "@/contexts/PanelContext"
import {selectNodesByIds} from "@/features/nodes/nodesSlice"

export default function DeleteButton() {
  const {t} = useTranslation()
  const [opened, {open, close}] = useDisclosure(false)
  const mode: PanelMode = useContext(PanelContext)
  const dispatch = useAppDispatch()
  const selectedIds = useAppSelector(s => selectSelectedNodeIds(s, mode))
  const selectedNodes = useAppSelector(s =>
    selectNodesByIds(s, selectedIds as string[])
  )

  const onSubmit = () => {
    dispatch(commanderSelectionCleared(mode))
    close()
  }

  const onCancel = () => {
    dispatch(commanderSelectionCleared(mode))
    close()
  }

  return (
    <>
      <Tooltip withArrow label={t("common.delete")}>
        <ActionIcon size="lg" onClick={open} color={"red"}>
          <IconTrash />
        </ActionIcon>
      </Tooltip>
      <DeleteNodesModal
        opened={opened}
        nodes={selectedNodes}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </>
  )
}
