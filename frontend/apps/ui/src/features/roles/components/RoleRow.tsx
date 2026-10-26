import {
  selectionAdd,
  selectionRemove,
  selectSelectedIds
} from "@/features/roles/rolesSlice"
import {formatBuiltinRoleName} from "@/features/roles/utils"
import type {Role} from "@/types"
import {Checkbox, Table} from "@mantine/core"
import {useDispatch, useSelector} from "react-redux"
import {Link} from "react-router-dom"
import {useTranslation} from "react-i18next"

type Args = {
  role: Role
}

export default function RoleRow({role}: Args) {
  const {t} = useTranslation()
  const selectedIds = useSelector(selectSelectedIds)
  const dispatch = useDispatch()

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.currentTarget.checked) {
      dispatch(selectionAdd(role.id))
    } else {
      dispatch(selectionRemove(role.id))
    }
  }

  return (
    <Table.Tr>
      <Table.Td>
        <Checkbox checked={selectedIds.includes(role.id)} onChange={onChange} />
      </Table.Td>
      <Table.Td>
        <Link to={`/roles/${role.id}`}>
          {formatBuiltinRoleName(role.name, t)}
        </Link>
      </Table.Td>
    </Table.Tr>
  )
}
