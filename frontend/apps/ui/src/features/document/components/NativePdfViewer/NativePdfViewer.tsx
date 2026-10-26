import {useAppSelector} from "@/app/hooks"
import PanelContext from "@/contexts/PanelContext"
import useCurrentDocVer from "@/features/document/hooks/useCurrentDocVer"
import {fileManager} from "@/features/files/fileManager"
import {guessMimeTypeFromFileName} from "@/features/document/documentPreview"
import {selectContentHeight} from "@/features/ui/uiSlice"
import {Loader} from "@mantine/core"
import {useContext, useEffect, useState} from "react"
import {useTranslation} from "react-i18next"

import type {PanelMode} from "@/types"

import classes from "./NativePdfViewer.module.css"

export default function NativePdfViewer() {
  const {docVer} = useCurrentDocVer()
  const mode: PanelMode = useContext(PanelContext)
  const height = useAppSelector(s => selectContentHeight(s, mode))
  const {t} = useTranslation()
  const [objectURL, setObjectURL] = useState<string>()

  useEffect(() => {
    if (!docVer) {
      setObjectURL(undefined)
      return
    }

    let currentUrl: string | undefined

    const applyBuffer = (buffer?: ArrayBuffer) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl)
        currentUrl = undefined
      }
      if (!buffer) {
        setObjectURL(undefined)
        return
      }
      currentUrl = URL.createObjectURL(
        new Blob([buffer], {
          type: guessMimeTypeFromFileName(docVer.file_name)
        })
      )
      setObjectURL(currentUrl)
    }

    const sync = () => {
      applyBuffer(fileManager.getByDocVerID(docVer.id)?.buffer)
    }

    const unsubscribe = fileManager.subscribeDocVerBuffer(docVer.id, sync)
    sync()

    return () => {
      unsubscribe()
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl)
      }
    }
  }, [docVer?.id, docVer?.file_name])

  if (!docVer) {
    return (
      <div className={classes.root} style={{height: `${height}px`}}>
        <Loader />
      </div>
    )
  }

  if (!objectURL) {
    return (
      <div className={classes.root} style={{height: `${height}px`}}>
        <Loader />
      </div>
    )
  }

  return (
    <div className={classes.root} style={{height: `${height}px`}}>
      <iframe
        title={t("public.document.preview")}
        src={objectURL}
        className={classes.frame}
      />
    </div>
  )
}
