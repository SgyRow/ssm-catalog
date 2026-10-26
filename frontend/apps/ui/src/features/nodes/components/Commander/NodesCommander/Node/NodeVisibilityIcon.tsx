import {Tooltip} from "@mantine/core"
import {IconLock, IconUsers, IconWorld} from "@tabler/icons-react"
import {useTranslation} from "react-i18next"

type Props = {
  summary?: string | null
}

export default function NodeVisibilityIcon({summary}: Props) {
  const {t} = useTranslation()

  if (!summary || summary === "private") {
    return (
      <Tooltip label={t("node.visibility.level.private")}>
        <IconLock size={14} style={{flexShrink: 0, verticalAlign: "middle"}} />
      </Tooltip>
    )
  }

  if (summary === "public") {
    return (
      <Tooltip label={t("node.visibility.level.public")}>
        <IconWorld size={14} style={{flexShrink: 0, verticalAlign: "middle"}} />
      </Tooltip>
    )
  }

  return (
    <Tooltip label={t("node.visibility.level.role_based")}>
      <IconUsers size={14} style={{flexShrink: 0, verticalAlign: "middle"}} />
    </Tooltip>
  )
}
