import {
  selectionAdd,
  selectionRemove,
  selectSelectedIds
} from "@/features/tags/tagsSlice"
import type {ColoredTag} from "@/types"
import {Checkbox, Pill, Table} from "@mantine/core"
import {useDispatch, useSelector} from "react-redux"
import {Link, useNavigate} from "react-router-dom"

import Check from "@/components/Check"

type Args = {
  tag: ColoredTag
}

export default function TagRow({tag}: Args) {
  const selectedIds = useSelector(selectSelectedIds)
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    if (e.currentTarget.checked) {
      dispatch(selectionAdd(tag.id))
    } else {
      dispatch(selectionRemove(tag.id))
    }
  }

  const onRowClick = () => {
    navigate(`/tags/${tag.id}`)
  }

  return (
    <Table.Tr onClick={onRowClick} style={{cursor: "pointer"}}>
      <Table.Td onClick={e => e.stopPropagation()}>
        <Checkbox checked={selectedIds.includes(tag.id)} onChange={onChange} />
      </Table.Td>
      <Table.Td>
        <Link to={`/tags/${tag.id}`} onClick={e => e.stopPropagation()}>
          <Pill style={{backgroundColor: tag.bg_color, color: tag.fg_color}}>
            {tag.name}
          </Pill>
        </Link>
      </Table.Td>
      <Table.Td>
        <Check check={tag.pinned} />
      </Table.Td>
      <Table.Td>{tag.description}</Table.Td>
      <Table.Td>{tag.id}</Table.Td>
    </Table.Tr>
  )
}
