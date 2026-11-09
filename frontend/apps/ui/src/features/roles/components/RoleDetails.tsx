import classes from "@/components/ViewportPage.module.css"
import {Box, Breadcrumbs, Group, Loader, LoadingOverlay} from "@mantine/core"
import {Link, useNavigation} from "react-router-dom"
import {useTranslation} from "react-i18next"
import {RoleForm} from "kommon"

import type {Role} from "@/types"
import {useGetRoleQuery} from "@/features/roles/apiSlice"
import {formatBuiltinRoleName, server2clientPerms} from "@/features/roles/utils"
import useI18NText from "@/features/roles/hooks/useRoleFormI18NText"
import EditButton from "./EditButton"
import {DeleteRoleButton} from "./DeleteButton"

interface RoleDetailsArgs {
  roleId: string
}

export default function RoleDetailsComponent({roleId}: RoleDetailsArgs) {
  const {data, isLoading} = useGetRoleQuery(roleId)
  const txt = useI18NText()

  if (isLoading || !data) {
    return (
      <div className={classes.page}>
        <Box pos="relative" p="md" className={classes.scroll}>
          <LoadingOverlay
            visible={true}
            zIndex={1000}
            overlayProps={{radius: "sm", blur: 2}}
          />
          <Path role={null} />
          <RoleForm
            txt={txt?.roleForm}
            isLoading={true}
            readOnly={true}
            initialCheckedState={[]}
            withScrollArea={false}
          />
        </Box>
      </div>
    )
  }

  return (
    <div className={classes.page}>
      <Group justify="space-between" p="md" pb="xs">
        <Path role={data} />
        <ActionButtons modelId={data?.id} />
      </Group>
      <div className={classes.scroll} style={{padding: "0 1rem 1rem"}}>
        <RoleForm
          key={`${data.id}-${data.scopes.join(",")}`}
          txt={txt?.roleForm}
          initialCheckedState={server2clientPerms(data.scopes)}
          name={data.name}
          isLoading={false}
          readOnly={true}
          withScrollArea={false}
        />
      </div>
    </div>
  )
}

function Path({role}: {role: Role | null}) {
  const navigation = useNavigation()
  const {t} = useTranslation()

  return (
    <Group>
      <Breadcrumbs>
        <Link to="/roles/">Roles</Link>
        <Link to={`/roles/${role?.id}`}>
          {role?.name ? formatBuiltinRoleName(role.name, t) : ""}
        </Link>
      </Breadcrumbs>
      {navigation.state == "loading" && <Loader size="sm" />}
    </Group>
  )
}

function ActionButtons({modelId}: {modelId?: string}) {
  return (
    <Group>
      <EditButton roleId={modelId!} />
      <DeleteRoleButton roleId={modelId!} />
    </Group>
  )
}
