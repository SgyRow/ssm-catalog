import {mainPanelSwitchedToSearchResults} from "@/features/ui/uiSlice"
import {CloseButton, Input, rem} from "@mantine/core"
import {IconSearch} from "@tabler/icons-react"
import {useState} from "react"
import {useDispatch} from "react-redux"
import {useTranslation} from "react-i18next"
import {useNavigate} from "react-router-dom"

export default function Search() {
  const {t} = useTranslation()
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [value, setValue] = useState("")

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(event.currentTarget.value)
  }

  const submitSearch = () => {
    const query = value.trim()
    if (!query) {
      return
    }
    dispatch(mainPanelSwitchedToSearchResults(query))
    navigate(`/search?q=${encodeURIComponent(query)}`)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      submitSearch()
    }
  }

  return (
    <Input
      placeholder={t("search.placeholder")}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      leftSection={
        <IconSearch style={{width: rem(16), height: rem(16)}} stroke={1.5} />
      }
      rightSectionPointerEvents="all"
      rightSection={
        <CloseButton
          aria-label={t("search.clear_input")}
          onClick={() => setValue("")}
          style={{display: value ? undefined : "none"}}
        />
      }
    />
  )
}
