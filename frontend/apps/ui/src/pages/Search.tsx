import SearchResults from "@/features/search/components/SearchResults"
import {mainPanelSwitchedToSearchResults, selectSearchPageHeight} from "@/features/ui/uiSlice"
import {useAppSelector} from "@/app/hooks"
import {Title} from "@mantine/core"
import {useEffect} from "react"
import {useTranslation} from "react-i18next"
import {useDispatch} from "react-redux"
import {useSearchParams} from "react-router-dom"
import classes from "./Search.module.css"

export default function SearchPage() {
  const {t} = useTranslation()
  const dispatch = useDispatch()
  const [params] = useSearchParams()
  const query = params.get("q") ?? ""
  const pageHeight = useAppSelector(selectSearchPageHeight)

  useEffect(() => {
    dispatch(mainPanelSwitchedToSearchResults(query))
  }, [dispatch, query])

  return (
    <div className={classes.page} style={{height: pageHeight}}>
      <Title className={classes.title} order={3}>
        {t("search.results_title", {query})}
      </Title>
      <div className={classes.results}>
        <SearchResults />
      </div>
    </div>
  )
}
