import {useAppDispatch, useAppSelector} from "@/app/hooks"
import {ActionIcon, Tooltip} from "@mantine/core"
import {IconColumns2, IconX} from "@tabler/icons-react"
import {useContext} from "react"
import {useTranslation} from "react-i18next"

import type {CType, PanelMode} from "@/types"

import PanelContext from "@/contexts/PanelContext"
import {canOpenCommander} from "@/scopes"
import {selectCurrentUser} from "@/slices/currentUser"
import {
  currentNodeChanged,
  secondaryPanelClosed,
  secondaryPanelOpened,
  selectCurrentNodeCType,
  selectCurrentNodeID,
  selectPanelComponent
} from "@/features/ui/uiSlice"

export default function ToggleSecondaryPanel() {
  const {t} = useTranslation()
  const mode: PanelMode = useContext(PanelContext)
  const dispatch = useAppDispatch()
  const nodeID = useAppSelector(s => selectCurrentNodeID(s, mode))
  const ctype = useAppSelector(s => selectCurrentNodeCType(s, mode))
  const secondaryPanel = useAppSelector(s =>
    selectPanelComponent(s, "secondary")
  )
  const user = useAppSelector(selectCurrentUser)
  const scopes = user?.scopes ?? []
  const folderCommanderAllowed = canOpenCommander(scopes)

  const onClick = () => {
    if (!nodeID || !ctype) {
      return
    }
    if (ctype === "folder" && !folderCommanderAllowed) {
      return
    }
    dispatch(secondaryPanelOpened(ctype == "folder" ? "commander" : "viewer"))
    dispatch(
      currentNodeChanged({
        id: nodeID,
        ctype: ctype as CType,
        panel: "secondary"
      })
    )
  }

  if (mode == "main") {
    /* Display button for splitting the panel if and only if there
      is no secondary panel opened */
    if (!secondaryPanel) {
      const commanderBlocked = ctype === "folder" && !folderCommanderAllowed
      return (
        <Tooltip label={t("document.split_screen")} withArrow>
          <ActionIcon
            size="lg"
            onClick={onClick}
            variant="default"
            disabled={!nodeID || !ctype || commanderBlocked}
            aria-label={t("document.split_screen")}
          >
            <IconColumns2 size={18} />
          </ActionIcon>
        </Tooltip>
      )
    }

    return <></>
  }

  return (
    <Tooltip label={t("document.split_screen")} withArrow>
      <ActionIcon
        onClick={() => dispatch(secondaryPanelClosed())}
        size="lg"
        variant="default"
        aria-label={t("document.split_screen")}
      >
        <IconX size={18} />
      </ActionIcon>
    </Tooltip>
  )
}
