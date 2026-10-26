import QuickFilter from "@/components/QuickFilter"
import {useAppSelector} from "@/app/hooks"
import {TAG_CREATE, TAG_DELETE, TAG_UPDATE} from "@/scopes"
import {selectCurrentUser} from "@/slices/currentUser"
import type {User} from "@/types"
import {selectFilterText, selectSelectedIds} from "@/features/tags/tagsSlice"
import {Group, Loader} from "@mantine/core"
import {useSelector} from "react-redux"
import {DeleteTagsButton} from "./DeleteButton"
import EditButton from "./EditButton"
import NewButton from "./NewButton"

interface Args {
  isFetching?: boolean
  onQuickFilterChange: (value: string) => void
  onQuickFilterClear: () => void
}

export default function ActionButtons({
  isFetching,
  onQuickFilterChange,
  onQuickFilterClear
}: Args) {
  const selectedIds = useSelector(selectSelectedIds)
  const filterText = useSelector(selectFilterText)
  const user = useAppSelector(selectCurrentUser) as User | null
  const scopes = user?.scopes ?? []
  const canCreate = scopes.includes(TAG_CREATE)
  const canUpdate = scopes.includes(TAG_UPDATE)
  const canDelete = scopes.includes(TAG_DELETE)

  return (
    <Group justify="space-between" style={{flex: 1}}>
      <Group>
        {canCreate ? <NewButton /> : null}
        {canUpdate && selectedIds.length === 1 ? (
          <EditButton tagId={selectedIds[0]} />
        ) : null}
        {canDelete && selectedIds.length >= 1 ? <DeleteTagsButton /> : null}
        {isFetching && <Loader size={"sm"} />}
      </Group>
      <Group>
        <QuickFilter
          onChange={onQuickFilterChange}
          onClear={onQuickFilterClear}
          filterText={filterText}
        />
      </Group>
    </Group>
  )
}
