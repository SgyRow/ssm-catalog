import {Tooltip, ActionIcon} from "@mantine/core"
import {IconArrowLeft} from "@tabler/icons-react"
import {useNavigate} from "react-router-dom"
import {useTranslation} from "react-i18next"

export default function GoBackButton() {
  const {t} = useTranslation()
  const navigate = useNavigate()

  const onClick = () => {
    navigate("/library/favorites")
  }

  return (
    <Tooltip label={t("search.go_back_library")} withArrow>
      <ActionIcon size={"lg"} variant="default" onClick={onClick}>
        <IconArrowLeft stroke={1.4} />
      </ActionIcon>
    </Tooltip>
  )
}
