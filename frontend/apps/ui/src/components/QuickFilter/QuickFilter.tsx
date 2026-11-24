import {TextInput} from "@mantine/core"
import {IconSearch, IconX} from "@tabler/icons-react"
import {useEffect, useRef, useState} from "react"
import {useTranslation} from "react-i18next"

interface Args {
  onChange: (value: string) => void
  onClear: () => void
  filterText?: string
}

const FILTER_DEBOUNCE_MS = 250

export default function QuickFilter({onChange, onClear, filterText}: Args) {
  const {t} = useTranslation()
  const [localFilterText, setLocalFilterText] = useState(filterText ?? "")
  const debounceRef = useRef<number | undefined>(undefined)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    return () => window.clearTimeout(debounceRef.current)
  }, [])

  const scheduleChange = (value: string) => {
    window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      onChangeRef.current(value.trim())
    }, FILTER_DEBOUNCE_MS)
  }

  const onLocalClear = () => {
    window.clearTimeout(debounceRef.current)
    setLocalFilterText("")
    onClear()
  }

  return (
    <TextInput
      rightSection={
        localFilterText ? (
          <IconX onClick={onLocalClear} style={{cursor: "pointer"}} />
        ) : (
          <IconSearch />
        )
      }
      onChange={event => {
        const value = event.currentTarget.value
        setLocalFilterText(value)
        scheduleChange(value)
      }}
      placeholder={t("common.quick_search")}
      value={localFilterText}
    />
  )
}
