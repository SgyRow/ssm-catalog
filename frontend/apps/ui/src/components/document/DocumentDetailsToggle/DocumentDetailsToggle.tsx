import {useAppDispatch, useAppSelector} from "@/app/hooks"
import PanelContext from "@/contexts/PanelContext"
import {
  selectDocumentDetailsPanelOpen,
  viewerDocumentDetailsPanelToggled
} from "@/features/ui/uiSlice"
import {PanelMode} from "@/types"
import {ActionIcon, Tooltip} from "@mantine/core"
import {
  IconLayoutSidebarRight,
  IconLayoutSidebarRightFilled
} from "@tabler/icons-react"
import {useContext} from "react"
import {useTranslation} from "react-i18next"

export default function DocumentDetailsToggle() {
  const {t} = useTranslation()
  const dispatch = useAppDispatch()
  const mode: PanelMode = useContext(PanelContext)
  const isOpen = useAppSelector(s => selectDocumentDetailsPanelOpen(s, mode))

  const onClick = () => {
    dispatch(viewerDocumentDetailsPanelToggled(mode))
  }

  return (
    <Tooltip label={t("document.about_file")} withArrow>
      <ActionIcon
        size="lg"
        variant="default"
        onClick={onClick}
        aria-pressed={isOpen}
        aria-label={t("document.about_file")}
      >
        {isOpen ? (
          <IconLayoutSidebarRightFilled size={18} />
        ) : (
          <IconLayoutSidebarRight size={18} />
        )}
      </ActionIcon>
    </Tooltip>
  )
}
