import {Anchor, Breadcrumbs, Group, Skeleton} from "@mantine/core"
import {IconBook2, IconFolder} from "@tabler/icons-react"
import {useTranslation} from "react-i18next"

import {useGetPortalRootQuery} from "@/features/portal/portalApiSlice"
import {PORTAL_VIEW} from "@/scopes"
import {selectCurrentUser} from "@/slices/currentUser"
import {useAppSelector} from "@/app/hooks"
import {equalUUIDs} from "@/utils"

import type {NType, UserDetails} from "@/types"

type Args = {
  items?: Array<[string, string]> | null
  pageNumber?: number | null
  fallbackTitle?: string
  onClick: (n: NType) => void
}

export default function Path({items, onClick, pageNumber, fallbackTitle}: Args) {
  if (!items || items.length == 0) {
    if (fallbackTitle) {
      return <Breadcrumbs>{fallbackTitle}</Breadcrumbs>
    }
    return <Skeleton height={18} width={45} />
  }

  if (items.length == 1) {
    return (
      <Breadcrumbs>
        <RootItem
          itemId={items[0][0]}
          rootTitle={items[0][1]}
          onClick={onClick}
        />
        {pageNumber && pageNumber > 1 && `Page ${pageNumber}`}
      </Breadcrumbs>
    )
  }
  const links = items.slice(1).map(i => (
    <Anchor onClick={() => onClick({id: i[0], ctype: "folder"})} key={i[0]}>
      {i[1]}
    </Anchor>
  ))

  return (
    <Breadcrumbs>
      <RootItem
        itemId={items[0][0]}
        rootTitle={items[0][1]}
        onClick={onClick}
      />
      {links}
      {pageNumber && pageNumber > 1 && `Page ${pageNumber}`}
    </Breadcrumbs>
  )
}

type RootItemArgs = {
  itemId: string
  rootTitle: string
  onClick: (n: NType) => void
}

function RootItem({itemId, rootTitle, onClick}: RootItemArgs) {
  const {t} = useTranslation()
  const user = useAppSelector(selectCurrentUser) as UserDetails | undefined
  const scopes = user?.scopes ?? []
  const {data: portalRoot} = useGetPortalRootQuery(undefined, {
    skip: !scopes.includes(PORTAL_VIEW)
  })
  const portalRootLabel = t("portal.root_folder")

  if (portalRoot && equalUUIDs(itemId, portalRoot.id)) {
    return (
      <Anchor onClick={() => onClick({id: portalRoot.id, ctype: "folder"})}>
        <Group>
          <IconBook2 />
          {portalRootLabel}
        </Group>
      </Anchor>
    )
  }

  return (
    <Anchor onClick={() => onClick({id: itemId, ctype: "folder"})}>
      <Group>
        <IconFolder />
        {rootTitle}
      </Group>
    </Anchor>
  )
}
