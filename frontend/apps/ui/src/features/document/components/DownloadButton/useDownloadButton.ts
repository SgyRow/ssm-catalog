import {useGetDocVersionsListQuery} from "@/features/document/store/apiSlice"
import type {DocVersItem} from "@/features/document/types"
import {UUID} from "@/types.d/common"
import {skipToken} from "@reduxjs/toolkit/query"
import {useEffect, useState} from "react"
import {useTranslation} from "react-i18next"
import type {DownloadDocumentVersion, I18NDownloadButtonText} from "viewer"
import {localizeVersionShortDescription} from "./localizeVersionShortDescription"

interface Args {
  initiateListDownload?: boolean
  nodeID?: UUID
}

interface UseI18nHookReturn {
  isInitialized: boolean
  txt?: I18NDownloadButtonText
}

interface DownloadButtonState {
  versions?: Array<DownloadDocumentVersion>
  txt?: I18NDownloadButtonText
  i18nIsReady: boolean
  isLoading: boolean
  isError: boolean
}

export default function useDownloadButton({
  initiateListDownload = false,
  nodeID
}: Args): DownloadButtonState {
  const [versions, setVersions] = useState<Array<DownloadDocumentVersion>>()
  const {t, i18n} = useTranslation()
  const {isInitialized, txt} = useI18nText()
  const apiParam = initiateListDownload && nodeID ? nodeID : skipToken
  const {data, isError, isLoading} = useGetDocVersionsListQuery(apiParam)

  useEffect(() => {
    if (data) {
      const vers = data.map((d: DocVersItem) => ({
        id: d.id,
        number: d.number,
        shortDescription: localizeVersionShortDescription(
          d.short_description,
          t
        )
      }))
      setVersions(vers)
    }
  }, [data, t, i18n.language])

  return {
    i18nIsReady: isInitialized,
    versions,
    txt,
    isLoading,
    isError
  }
}

function useI18nText(): UseI18nHookReturn {
  const {t, i18n} = useTranslation()
  const [txt, setTxt] = useState<I18NDownloadButtonText>()

  useEffect(() => {
    if (i18n.isInitialized) {
      setTxt({
        downloadInProgressTooltip:
          t("downloadButton.downloadInProgressTooltip") ||
          "Download in progress...",
        downloadTooltip:
          t("downloadButton.downloadTooltip") || "Download document",
        loadingTooltip: t("downloadButton.loadingTooltip") || "Loading...",
        error: t("downloadButton.error") || "Error: Oops, it didn't work",
        emptyVersionsArrayError:
          t("downloadButton.emptyVersionsArrayError") ||
          "Error: empty version list",
        versionLabel: t("downloadButton.versionLabel") || "Version"
      })
    } else {
      setTxt(undefined)
    }
  }, [i18n.isInitialized, t])

  return {
    isInitialized: i18n.isInitialized,
    txt
  }
}
