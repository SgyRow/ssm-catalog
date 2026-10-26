import {useAppSelector} from "@/app/hooks"
import PanelContext from "@/contexts/PanelContext"
import BlobMediaPage from "@/features/document/components/Page/BlobMediaPage"
import useCurrentDocVer from "@/features/document/hooks/useCurrentDocVer"
import {fileManager} from "@/features/files/fileManager"
import {guessMimeTypeFromFileName} from "@/features/document/documentPreview"
import {selectContentHeight} from "@/features/ui/uiSlice"
import {Box, Loader, ScrollArea} from "@mantine/core"
import {useContext, useEffect, useMemo, useState} from "react"

import type {PanelMode} from "@/types"

import classes from "./BlobDocumentViewer.module.css"

export default function BlobDocumentViewer() {
  const {docVer} = useCurrentDocVer()
  const mode: PanelMode = useContext(PanelContext)
  const height = useAppSelector(s => selectContentHeight(s, mode))
  const [fallbackObjectURL, setFallbackObjectURL] = useState<string>()

  const firstPage = useMemo(() => {
    const pages = docVer?.pages?.slice().sort((a, b) => a.number - b.number)
    return pages?.[0]
  }, [docVer?.pages])

  useEffect(() => {
    if (!docVer) {
      setFallbackObjectURL(undefined)
      return
    }

    const buffer = fileManager.getByDocVerID(docVer.id)?.buffer
    if (!buffer) {
      setFallbackObjectURL(undefined)
      return
    }

    const mime = guessMimeTypeFromFileName(docVer.file_name)
    const objectURL = URL.createObjectURL(new Blob([buffer], {type: mime}))
    setFallbackObjectURL(objectURL)

    return () => {
      URL.revokeObjectURL(objectURL)
    }
  }, [docVer?.id, docVer?.file_name])

  if (!docVer) {
    return (
      <div className={classes.root} style={{height: `${height}px`}}>
        <Loader />
      </div>
    )
  }

  return (
    <div className={classes.root} style={{height: `${height}px`}}>
      <ScrollArea className={classes.scroll} type="auto" scrollbarSize={8}>
        <Box p="md" pb="xl">
          <BlobMediaPage
            pageID={firstPage?.id || ""}
            pageNumber={firstPage?.number || 1}
            zoomFactor={100}
            fileName={docVer.file_name}
            objectURLOverride={fallbackObjectURL}
            layout="standalone"
            availableHeight={height}
          />
        </Box>
      </ScrollArea>
    </div>
  )
}
