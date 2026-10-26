import {ActionIcon, Tooltip} from "@mantine/core"
import {IconEdit} from "@tabler/icons-react"

import {useTranslation} from "react-i18next"

interface Args {
  onClick: () => void
}

export default function EditTitleButton({onClick}: Args) {
  const {t} = useTranslation()

  return (
    <Tooltip label={t("common.change_title")} withArrow>
      <ActionIcon size="lg" variant="default" onClick={onClick}>
        <IconEdit size={18} stroke={1.4} />
      </ActionIcon>
    </Tooltip>
  )
}
