import {NType, SearchResultNode} from "@/types"
import {Stack, Text} from "@mantine/core"
import {useTranslation} from "react-i18next"
import SearchResultItem from "./SearchResultItem"

type Args = {
  onClick: (n: NType, page?: number) => void
  items: Array<SearchResultNode>
}

export default function SearchResultItems({items, onClick}: Args) {
  const {t} = useTranslation()
  if (items?.length == 0) {
    return <Text my={"md"}>{t("search.nothing_found")}</Text>
  }

  return (
    <Stack gap="sm" py="xs">
      {items.map(item => (
        <SearchResultItem
          key={
            item.entity_type == "document"
              ? (item.document_id ?? item.id)
              : item.id
          }
          item={item}
          onClick={onClick}
        />
      ))}
    </Stack>
  )
}
