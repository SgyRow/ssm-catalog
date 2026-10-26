import {ActionIcon, Tooltip} from "@mantine/core"
import {IconTrash} from "@tabler/icons-react"
import {useTranslation} from "react-i18next"

interface Args {
  onClick: () => void
}

export default function DeleteButton({onClick}: Args) {
  const {t} = useTranslation()
  return (
    <>
      <Tooltip withArrow label={t("common.delete")}>
        <ActionIcon size="lg" onClick={onClick} color={"red"}>
          <IconTrash size={18} />
        </ActionIcon>
      </Tooltip>
    </>
  )
}
