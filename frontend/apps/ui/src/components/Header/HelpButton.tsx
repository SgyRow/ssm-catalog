import {Tooltip, UnstyledButton} from "@mantine/core"
import {IconHelp} from "@tabler/icons-react"
import {useTranslation} from "react-i18next"
import {useNavigate} from "react-router-dom"

export default function HelpButton() {
  const {t} = useTranslation()
  const navigate = useNavigate()

  return (
    <Tooltip label={t("user_guide.tooltip")}>
      <UnstyledButton
        aria-label={t("user_guide.tooltip")}
        onClick={() => navigate("/help")}
      >
        <IconHelp />
      </UnstyledButton>
    </Tooltip>
  )
}
