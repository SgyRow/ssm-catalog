import {useAppSelector} from "@/app/hooks"
import {selectCurrentNodeID} from "@/features/ui/uiSlice"
import {ActionIcon, Tooltip} from "@mantine/core"
import {useDisclosure} from "@mantine/hooks"
import {IconTemplate} from "@tabler/icons-react"
import {useContext} from "react"

import type {PanelMode} from "@/types"

import PanelContext from "@/contexts/PanelContext"
import {MspTemplateModal} from "@/features/nodes/components/MspTemplateModal"
import {useTranslation} from "react-i18next"

export default function MspTemplateButton() {
  const {t} = useTranslation()
  const [opened, {open, close}] = useDisclosure(false)
  const mode: PanelMode = useContext(PanelContext)
  const currentFolderId = useAppSelector(s => selectCurrentNodeID(s, mode))

  return (
    <>
      <Tooltip label={t("mspTemplate.button")} withArrow>
        <ActionIcon size={"lg"} variant="default" onClick={open}>
          <IconTemplate stroke={1.4} />
        </ActionIcon>
      </Tooltip>
      <MspTemplateModal
        opened={opened}
        parent_id={currentFolderId!}
        onSubmit={close}
        onCancel={close}
      />
    </>
  )
}
