import {ActionIcon, Tooltip} from "@mantine/core"
import {useDisclosure} from "@mantine/hooks"
import {IconEye} from "@tabler/icons-react"
import {useContext} from "react"
import {useTranslation} from "react-i18next"

import {useAppSelector} from "@/app/hooks"
import type {RootState} from "@/app/types"
import EditNodeVisibilityModal from "@/components/EditNodeVisibilityModal/EditNodeVisibilityModal"
import {selectNodesByIds} from "@/features/nodes/nodesSlice"
import {selectSelectedNodeIds} from "@/features/ui/uiSlice"
import PanelContext from "@/contexts/PanelContext"
import type {PanelMode} from "@/types"

export default function EditNodeVisibilityButton() {
  const {t} = useTranslation()
  const [opened, {open, close}] = useDisclosure(false)
  const mode: PanelMode = useContext(PanelContext)
  const selectedIds = useAppSelector((state: RootState) =>
    selectSelectedNodeIds(state, mode)
  )
  const selectedNodes = useAppSelector(s =>
    selectNodesByIds(s, selectedIds as string[])
  )
  const nodeID = selectedNodes[0]?.id

  if (!nodeID) {
    return null
  }

  return (
    <>
      <Tooltip label={t("node.visibility.button")} withArrow>
        <ActionIcon size="lg" variant="default" onClick={open}>
          <IconEye stroke={1.4} />
        </ActionIcon>
      </Tooltip>
      <EditNodeVisibilityModal
        opened={opened}
        onClose={close}
        nodeID={nodeID}
      />
    </>
  )
}
