import {useAppDispatch, useAppSelector} from "@/app/hooks"
import PanelContext from "@/contexts/PanelContext"
import {
  commanderSortMenuColumnUpdated,
  commanderSortMenuDirectionUpdated,
  selectCommanderSortMenuColumn,
  selectCommanderSortMenuDir
} from "@/features/ui/uiSlice"
import type {SortMenuColumn, SortMenuDirection} from "@/types"
import {ActionIcon, Menu} from "@mantine/core"
import {IconArrowsSort, IconCheck} from "@tabler/icons-react"
import {useContext} from "react"
import {useTranslation} from "react-i18next"

type SortMenuProps = {
  reorderMode?: boolean
  onApplyReorderSort?: (
    column: SortMenuColumn | undefined,
    direction: SortMenuDirection
  ) => void
}

export default function SortMenu({
  reorderMode = false,
  onApplyReorderSort
}: SortMenuProps) {
  const {t} = useTranslation()
  const dispatch = useAppDispatch()
  const mode = useContext(PanelContext)
  const column = useAppSelector(s => selectCommanderSortMenuColumn(s, mode))
  const direction = useAppSelector(s => selectCommanderSortMenuDir(s, mode))

  const setColumn = (value: SortMenuColumn) => {
    const nextColumn = column === value ? undefined : value
    dispatch(
      commanderSortMenuColumnUpdated({
        mode,
        column: nextColumn
      })
    )
    if (reorderMode) {
      onApplyReorderSort?.(nextColumn, direction)
    }
  }

  const setDirection = (value: SortMenuDirection) => {
    dispatch(commanderSortMenuDirectionUpdated({mode, direction: value}))
    if (reorderMode) {
      onApplyReorderSort?.(column, value)
    }
  }

  const columnLabel = (value: SortMenuColumn) => {
    switch (value) {
      case "title":
        return t("common.sort.title")
      case "file_type":
        return t("common.sort.type")
      case "created_at":
        return t("common.sort.created")
      case "updated_at":
        return t("common.sort.modified")
    }
  }

  return (
    <Menu shadow="md" width={190} withinPortal>
      <Menu.Target>
        <ActionIcon size="lg" variant="default" aria-label={t("common.sort.title")}>
          <IconArrowsSort size={18} />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>{t("common.sort.title")}</Menu.Label>
        {(["title", "file_type", "updated_at", "created_at"] as SortMenuColumn[]).map(
          item => (
            <Menu.Item
              key={item}
              onClick={() => setColumn(item)}
              rightSection={column === item ? <IconCheck size={16} /> : null}
            >
              {columnLabel(item)}
            </Menu.Item>
          )
        )}
        <Menu.Divider />
        <Menu.Label>{t("common.sort.type")}</Menu.Label>
        <Menu.Item
          onClick={() => setDirection("az")}
          rightSection={direction === "az" ? <IconCheck size={16} /> : null}
        >
          {t("common.sort.ascending")}
        </Menu.Item>
        <Menu.Item
          onClick={() => setDirection("za")}
          rightSection={direction === "za" ? <IconCheck size={16} /> : null}
        >
          {t("common.sort.descending")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
