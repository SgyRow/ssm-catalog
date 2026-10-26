import {ActionIcon, Tooltip} from "@mantine/core"
import {IconRotate} from "@tabler/icons-react"
import {useTranslation} from "react-i18next"

interface Args {
  onClick: () => void
}

export default function RotateCCButton({onClick}: Args) {
  const {t} = useTranslation()
  return (
    <Tooltip label={t("document.rotate_counter_clockwise")} withArrow>
      <ActionIcon size={"lg"} variant="default" onClick={onClick}>
        <IconRotate size={18} stroke={1.4} />
      </ActionIcon>
    </Tooltip>
  )
}
