import {useAppSelector} from "@/app/hooks"
import {useGetPortalRootQuery} from "@/features/portal/portalApiSlice"
import {selectNodeById} from "@/features/search/searchSlice"
import {normalizeSearchBreadcrumb} from "@/features/search/searchBreadcrumb"
import type {NType, SearchResultNode} from "@/types"
import {drop_extension} from "@/utils"
import {Badge, Group, Paper, Stack, Text} from "@mantine/core"
import {IconFile, IconFolder} from "@tabler/icons-react"
import {useMemo} from "react"
import {useTranslation} from "react-i18next"
import Breadcrumb from "./Breadcrumb"
import Tags from "./Tags"
import classes from "./item.module.css"

type Args = {
  item: SearchResultNode
  onClick: (n: NType, page?: number) => void
}

export default function SearchResultItem({item, onClick}: Args) {
  const {t} = useTranslation()
  const item_id = (
    item.entity_type == "document" ? item.document_id : item.id
  ) as string
  const nodeDetails = useAppSelector(s => selectNodeById(s, item_id))
  const {data: portalRoot} = useGetPortalRootQuery()
  const breadcrumb = useMemo(
    () =>
      normalizeSearchBreadcrumb(
        nodeDetails?.breadcrumb,
        portalRoot?.id,
        t("portal.root_folder")
      ),
    [nodeDetails?.breadcrumb, portalRoot?.id, t]
  )

  const isFolder = item.entity_type == "folder"
  const pageNumber = item.page_number

  const onCardClick = () => {
    if (isFolder) {
      onClick({id: item.id, ctype: "folder"})
      return
    }
    onClick({id: item.document_id!, ctype: "document"}, pageNumber ?? undefined)
  }

  return (
    <Paper
      withBorder
      radius="md"
      p="md"
      className={classes.card}
      onClick={onCardClick}
    >
      <Stack gap="sm">
        <div onClick={event => event.stopPropagation()}>
          <Breadcrumb
            onClick={onClick}
            items={breadcrumb}
            fallbackTitle={isFolder ? item.title : drop_extension(item.title)}
            pageNumber={!isFolder ? pageNumber : undefined}
          />
        </div>

        <Group wrap="nowrap" align="flex-start" gap="sm">
          <div className={classes.icon}>
            {isFolder ? (
              <IconFolder size={28} stroke={1.5} />
            ) : (
              <IconFile size={28} stroke={1.5} />
            )}
          </div>

          <Stack gap={6} className={classes.body}>
            <Group gap="xs" wrap="wrap" align="center">
              <Text className={classes.title} fw={600} size="sm" lineClamp={2}>
                {isFolder ? item.title : drop_extension(item.title)}
              </Text>
              {!isFolder && pageNumber && pageNumber > 1 && (
                <Badge variant="light" size="sm">
                  {t("search.page_badge", {page: pageNumber})}
                </Badge>
              )}
              <Badge variant="outline" size="sm" color="gray">
                {isFolder
                  ? t("search.filter.folders")
                  : t("search.filter.documents")}
              </Badge>
            </Group>

            {nodeDetails?.tags && nodeDetails.tags.length > 0 && (
              <Tags items={nodeDetails.tags} maxItems={8} />
            )}
          </Stack>
        </Group>
      </Stack>
    </Paper>
  )
}
