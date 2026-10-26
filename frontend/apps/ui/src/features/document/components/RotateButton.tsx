import {ActionIcon, Tooltip} from "@mantine/core"
import {IconRotateClockwise} from "@tabler/icons-react"
import {useTranslation} from "react-i18next"

interface Args {
  onClick: () => void
}

export default function RotateButton({onClick}: Args) {
  const {t} = useTranslation()
  return (
    <Tooltip label={t("document.rotate_clockwise")} withArrow>
      <ActionIcon size={"lg"} variant="default" onClick={onClick}>
        <IconRotateClockwise size={18} stroke={1.4} />
      </ActionIcon>
    </Tooltip>
  )
}
