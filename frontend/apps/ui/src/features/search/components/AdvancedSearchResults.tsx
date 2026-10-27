import type {AdvancedSearchItem} from "@/features/search/advancedApiSlice"
import classes from "@/features/search/AdvancedSearch.module.css"
import {useGetPortalRootQuery} from "@/features/portal/portalApiSlice"
import {makePortalDocumentNavState} from "@/features/portal/portalNavState"
import {formatNodeDisplayTitle} from "@/utils"
import {formatApiDateTimeCompact} from "@/utils/formatDateTime"
import {Loader, Stack, Text} from "@mantine/core"
import {IconFile, IconFolder} from "@tabler/icons-react"
import {useMemo} from "react"
import {Link} from "react-router-dom"
import {useTranslation} from "react-i18next"

type Args = {
  items: AdvancedSearchItem[]
  loading?: boolean
}

export default function AdvancedSearchResults({items, loading}: Args) {
  const {t} = useTranslation()
  const {data: portalRoot} = useGetPortalRootQuery()
  const documentNavState = useMemo(
    () => (portalRoot ? makePortalDocumentNavState(portalRoot) : null),
    [portalRoot]
  )

  if (loading) {
    return <Loader size="sm" />
  }

  if (items.length === 0) {
    return <Text c="dimmed">{t("search.nothing_found")}</Text>
  }

  return (
    <Stack gap="xs">
      {items.map(item => (
        <Link
          key={item.id}
          className={classes.result}
          to={
            item.ctype === "folder"
              ? `/portal/folder/${item.id}`
              : `/document/${item.id}`
          }
          state={item.ctype === "document" ? documentNavState : undefined}
        >
          {item.ctype === "folder" ? (
            <IconFolder size={20} />
          ) : (
            <IconFile size={20} />
          )}
          <span>
            <Text fw={600} size="sm">
              {formatNodeDisplayTitle(item.title, item.ctype)}
            </Text>
            <span className={classes.meta}>
              {formatApiDateTimeCompact(item.updated_at)}
              {item.tags.length > 0 ? ` · ${item.tags.join(", ")}` : ""}
            </span>
          </span>
        </Link>
      ))}
    </Stack>
  )
}
