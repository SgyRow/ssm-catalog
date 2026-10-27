import {useAppSelector} from "@/app/hooks"
import {
  useLazyAdvancedSearchQuery,
  type AdvancedSearchArgs
} from "@/features/search/advancedApiSlice"
import AdvancedSearchPanel from "@/features/search/components/AdvancedSearchPanel"
import AdvancedSearchResults from "@/features/search/components/AdvancedSearchResults"
import SearchResults from "@/features/search/components/SearchResults"
import {
  mainPanelSwitchedToSearchResults,
  selectSearchPageHeight
} from "@/features/ui/uiSlice"
import {Button, Group, Text, Title} from "@mantine/core"
import {IconChevronDown, IconChevronUp} from "@tabler/icons-react"
import {useEffect, useState} from "react"
import {useTranslation} from "react-i18next"
import {useDispatch} from "react-redux"
import {useSearchParams} from "react-router-dom"
import classes from "./Search.module.css"

export default function SearchPage() {
  const {t} = useTranslation()
  const dispatch = useDispatch()
  const [params, setParams] = useSearchParams()
  const query = params.get("q") ?? ""
  const wantAdvanced = params.get("advanced") === "1"
  const pageHeight = useAppSelector(selectSearchPageHeight)
  const [expanded, setExpanded] = useState(wantAdvanced)
  const [advancedActive, setAdvancedActive] = useState(false)
  const [runAdvanced, {data, isFetching}] = useLazyAdvancedSearchQuery()

  useEffect(() => {
    dispatch(mainPanelSwitchedToSearchResults(query))
  }, [dispatch, query])

  useEffect(() => {
    if (wantAdvanced) {
      setExpanded(true)
    }
  }, [wantAdvanced])

  const setAdvancedInUrl = (open: boolean) => {
    const next = new URLSearchParams(params)
    if (open) {
      next.set("advanced", "1")
    } else {
      next.delete("advanced")
    }
    setParams(next, {replace: true})
  }

  const toggleAdvanced = () => {
    const next = !expanded
    setExpanded(next)
    setAdvancedInUrl(next)
    if (!next) {
      setAdvancedActive(false)
    }
  }

  const onAdvancedSearch = (args: AdvancedSearchArgs) => {
    setAdvancedActive(true)
    void runAdvanced(args)
  }

  return (
    <div className={classes.page} style={{height: pageHeight}}>
      <Group
        justify="space-between"
        align="center"
        wrap="wrap"
        className={classes.title}
      >
        <Title order={3}>
          {query
            ? t("search.results_title", {query})
            : t("search.placeholder")}
        </Title>
        <Button
          variant={expanded ? "filled" : "light"}
          rightSection={
            expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />
          }
          onClick={toggleAdvanced}
        >
          {t("search.advanced_title")}
        </Button>
      </Group>
      {expanded ? (
        <div className={classes.advanced}>
          <AdvancedSearchPanel
            initialTitle={query}
            searching={isFetching}
            onSearch={onAdvancedSearch}
          />
        </div>
      ) : null}
      <div className={classes.results}>
        {advancedActive ? (
          <AdvancedSearchResults
            items={data?.items ?? []}
            loading={isFetching}
          />
        ) : query ? (
          <SearchResults />
        ) : (
          <Text c="dimmed">{t("search.quick_hint")}</Text>
        )}
      </div>
    </div>
  )
}
