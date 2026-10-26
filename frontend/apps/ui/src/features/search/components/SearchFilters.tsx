import {Group, Select} from "@mantine/core"
import {useTranslation} from "react-i18next"

import type {
  SearchEntityTypeFilter,
  SearchSortOption
} from "@/features/search/types"

type Args = {
  entityType: SearchEntityTypeFilter
  sort: SearchSortOption
  onEntityTypeChange: (value: SearchEntityTypeFilter) => void
  onSortChange: (value: SearchSortOption) => void
}

export default function SearchFilters({
  entityType,
  sort,
  onEntityTypeChange,
  onSortChange
}: Args) {
  const {t} = useTranslation()

  return (
    <Group grow preventGrowOverflow={false} wrap="wrap" gap="sm" maw={520}>
      <Select
        label={t("search.filter.entity_type")}
        value={entityType}
        data={[
          {value: "all", label: t("search.filter.all")},
          {value: "folder", label: t("search.filter.folders")},
          {value: "document", label: t("search.filter.documents")}
        ]}
        onChange={value =>
          onEntityTypeChange((value as SearchEntityTypeFilter) || "all")
        }
        allowDeselect={false}
      />
      <Select
        label={t("search.filter.sort")}
        value={sort}
        data={[
          {value: "relevance", label: t("search.sort.relevance")},
          {value: "title_asc", label: t("search.sort.title_asc")},
          {value: "title_desc", label: t("search.sort.title_desc")}
        ]}
        onChange={value =>
          onSortChange((value as SearchSortOption) || "relevance")
        }
        allowDeselect={false}
      />
    </Group>
  )
}
