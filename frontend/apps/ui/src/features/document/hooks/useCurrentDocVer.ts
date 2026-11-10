import {useAppDispatch, useAppSelector} from "@/app/hooks"
import {useGetDocLastVersionQuery} from "@/features/document/store"
import {useGetDocumentQuery} from "@/features/document/store/apiSlice"
import {selectLatestDocVerByDocID} from "@/features/document/store/docsSlice"
import {
  addDocVersion,
  selectDocVerByID,
  selectDocumentVersionID
} from "@/features/document/store/documentVersSlice"
import {
  currentDocVerUpdated,
  selectCurrentDocumentID
} from "@/features/ui/uiSlice"
import {usePanelMode} from "@/hooks"
import {ClientDocumentVersion} from "@/types"
import type {FetchBaseQueryError} from "@reduxjs/toolkit/query"
import {skipToken} from "@reduxjs/toolkit/query"
import {useEffect, useMemo} from "react"
import {clientDVFromDV} from "../utils"

interface SerializedError {
  name?: string
  message?: string
  stack?: string
  code?: string
}

interface ReturnState {
  isError: boolean
  error: FetchBaseQueryError | SerializedError | undefined
  docVer: ClientDocumentVersion | undefined
}

export default function useCurrentDocVer(): ReturnState {
  const dispatch = useAppDispatch()
  const mode = usePanelMode()
  const currentDocumentID = useAppSelector(s =>
    selectCurrentDocumentID(s, mode)
  )
  const latestDocVerID = useAppSelector(s =>
    selectLatestDocVerByDocID(s, currentDocumentID)
  )
  const docVerFromSlice = useAppSelector(s =>
    selectDocVerByID(s, latestDocVerID)
  )
  const {
    // should be `currentData` here not `data`, otherwise there will
    // be a flicker previous document when user opens viewer
    currentData,
    isFetching,
    isSuccess,
    isError,
    error
  } = useGetDocLastVersionQuery(currentDocumentID ?? skipToken, {
    refetchOnMountOrArgChange: true
  })
  const {currentData: doc}
    = useGetDocumentQuery(currentDocumentID ?? skipToken)
  const currentDocVerID = useAppSelector(s =>
    selectDocumentVersionID(s, mode)
  )
  const currentDocVer = useAppSelector(s =>
    selectDocVerByID(s, currentDocVerID)
  )
  /**
   * The version the user pinned via the version selector.
   * Only respected when it belongs to the currently open document,
   * otherwise a stale value from the previous document would be shown
   * during navigation.
   */
  const pinnedDocVer =
    currentDocVer && currentDocVer.document_id === currentDocumentID
      ? currentDocVer
      : undefined
  const isCurrentDocVerOfThisDoc = Boolean(
    currentDocVerID &&
    doc?.versions?.some(v => v.id === currentDocVerID)
  )

  useEffect(() => {
    if (currentData) {
      // Do not override the version the user pinned via the version
      // selector. `pinnedDocVer` is only set when the current docVer
      // actually belongs to the currently open document, so a stale value
      // from the previous document never suppresses the auto-select of
      // the latest version here. (Note: `doc` above is a
      // `DocumentWithoutVersions`, its `versions` list is empty, so we
      // must NOT rely on it for this check.)
      if (pinnedDocVer || (currentDocVerID && isCurrentDocVerOfThisDoc)) {
        return
      }

      // set current docVer to the value of docVer
      // return docVer as current one

      if (!latestDocVerID) {
        dispatch(addDocVersion(currentData))
      }
      dispatch(currentDocVerUpdated({mode: mode, docVerID: currentData.id}))
    }
  }, [
    currentData,
    latestDocVerID,
    currentDocumentID,
    currentDocVerID,
    isCurrentDocVerOfThisDoc,
    pinnedDocVer
  ])

  const docVer: ClientDocumentVersion | undefined = useMemo(() => {
    if (pinnedDocVer) {
      return pinnedDocVer
    } else if (docVerFromSlice) {
      return docVerFromSlice
    } else if (currentData) {
      return clientDVFromDV(currentData)
    } else {
      return undefined
    }
  }, [currentData, docVerFromSlice, pinnedDocVer, latestDocVerID, mode])

  return {
    error: undefined,
    isError: false,
    docVer: docVer
  }
}
