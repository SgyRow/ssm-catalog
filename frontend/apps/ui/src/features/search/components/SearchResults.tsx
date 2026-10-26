import {useAppDispatch, useAppSelector} from "@/app/hooks"
import Pagination from "@/components/Pagination"
import {Center, Loader, Stack} from "@mantine/core"
import {useEffect, useMemo, useState, type ReactNode} from "react"
import {useTranslation} from "react-i18next"
import {useNavigate} from "react-router-dom"

import {
  useGetNodesQuery,
  useGetPaginatedSearchResultsQuery
} from "@/features/search/apiSlice"
import SearchFilters from "@/features/search/components/SearchFilters"
import type {
  SearchEntityTypeFilter,
  SearchSortOption
} from "@/features/search/types"
import {isPortalSearchNode} from "@/features/search/portalNavigation"
import {useGetPortalRootQuery} from "@/features/portal/portalApiSlice"
import {makePortalDocumentNavState} from "@/features/portal/portalNavState"
import {
  currentNodeChanged,
  searchResultsLastPageSizeUpdated,
  selectSearchLastPageSize,
  selectSearchQuery,
  viewerCurrentPageUpdated
} from "@/features/ui/uiSlice"
import {NType, SearchResultNode} from "@/types"
import {skipToken} from "@reduxjs/toolkit/query"
import ActionButtons from "./ActionButtons"
import SearchResultItems from "./SearchResultItems"
import classes from "./SearchResults.module.css"

function SearchResultsLayout({
  toolbar,
  children,
  footer
}: {
  toolbar: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className={classes.root}>
      <div className={classes.toolbar}>{toolbar}</div>
      <div className={classes.scrollArea}>{children}</div>
      {footer ? <div className={classes.footer}>{footer}</div> : null}
    </div>
  )
}

export default function SearchResults() {
  const {t} = useTranslation()
  const navigate = useNavigate()
  const lastPageSize = useAppSelector(selectSearchLastPageSize)
  const [page, setPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(lastPageSize)
  const [nodeIDs, setNodeIDs] = useState<string[] | null>(null)
  const [entityType, setEntityType] = useState<SearchEntityTypeFilter>("all")
  const [sort, setSort] = useState<SearchSortOption>("relevance")

  const dispatch = useAppDispatch()
  const query = useAppSelector(selectSearchQuery)
  const searchNodeEntities = useAppSelector(s => s.search.nodes.entities)
  const {data: portalRoot} = useGetPortalRootQuery()
  const portalDocumentNavState = useMemo(
    () => (portalRoot ? makePortalDocumentNavState(portalRoot) : null),
    [portalRoot]
  )

  const searchArgs = useMemo(
    () =>
      query
        ? {
            qs: query,
            page_number: page,
            page_size: pageSize,
            entity_type: entityType,
            sort
          }
        : null,
    [query, page, pageSize, entityType, sort]
  )

  const {data, isLoading, isError} =
    useGetPaginatedSearchResultsQuery(searchArgs ?? skipToken)
  const {data: _extraData} = useGetNodesQuery(nodeIDs ? nodeIDs : skipToken)

  useEffect(() => {
    setPage(1)
  }, [entityType, sort, query])

  useEffect(() => {
    const nonEmptyItems: SearchResultNode[] = data?.items || []
    if (nonEmptyItems.length > 0) {
      const newNodeIDs = [
        ...new Set(
          nonEmptyItems
            .map(n => (n.entity_type == "folder" ? n.id : n.document_id))
            .filter((id): id is string => Boolean(id))
        )
      ]

      if (newNodeIDs.length > 0) {
        setNodeIDs(newNodeIDs)
      } else {
        setNodeIDs(null)
      }
    }
  }, [data?.items])

  const onClick = (node: NType, page?: number) => {
    const portal = isPortalSearchNode(
      node.id,
      portalRoot?.id,
      searchNodeEntities
    )

    switch (node.ctype) {
      case "folder":
        if (portal) {
          navigate(`/portal/folder/${node.id}`)
        } else {
          navigate(`/folder/${node.id}?page_size=${lastPageSize}`)
        }
        break
      case "document":
        if (portal && portalDocumentNavState) {
          navigate(`/document/${node.id}`, {state: portalDocumentNavState})
        } else {
          navigate(`/document/${node.id}`)
        }
        break
    }
    dispatch(currentNodeChanged({id: node.id, ctype: node.ctype, panel: "main"}))

    if (node.ctype == "document" && page) {
      dispatch(viewerCurrentPageUpdated({pageNumber: page, panel: "main"}))
    }
  }

  const onPageNumberChange = (page: number) => {
    setPage(page)
  }

  const onPageSizeChange = (value: string | null) => {
    if (value) {
      const pageSize = parseInt(value)

      dispatch(searchResultsLastPageSizeUpdated(pageSize))
      setPageSize(pageSize)
    }
  }

  const toolbar = (
    <Stack gap="md">
      <ActionButtons />
      <SearchFilters
        entityType={entityType}
        sort={sort}
        onEntityTypeChange={setEntityType}
        onSortChange={setSort}
      />
    </Stack>
  )

  if (isError) {
    return (
      <SearchResultsLayout toolbar={toolbar}>
        <Center>{t("search.error")}</Center>
      </SearchResultsLayout>
    )
  }

  if (isLoading || !data) {
    return (
      <SearchResultsLayout toolbar={toolbar}>
        <Center>
          <Loader type="bars" />
        </Center>
      </SearchResultsLayout>
    )
  }

  return (
    <SearchResultsLayout
      toolbar={toolbar}
      footer={
        <Pagination
          pagination={{
            pageNumber: page,
            pageSize: pageSize,
            numPages: data?.num_pages
          }}
          onPageNumberChange={onPageNumberChange}
          onPageSizeChange={onPageSizeChange}
          lastPageSize={lastPageSize}
        />
      }
    >
      <SearchResultItems items={data.items} onClick={onClick} />
    </SearchResultsLayout>
  )
}
