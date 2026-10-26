import {useAppSelector} from "@/app/hooks"
import PanelContext from "@/contexts/PanelContext"
import useCurrentDocVer from "@/features/document/hooks/useCurrentDocVer"
import {selectBestImageByPageId} from "@/features/document/store/selectors"
import {selectZoomFactor} from "@/features/ui/uiSlice"
import {Loader} from "@mantine/core"
import {PageList} from "viewer"
import {useContext, useMemo} from "react"

import docxClasses from "./DocxPreview.module.css"
import DocxPreviewCore from "./DocxPreviewCore"
import {useDocxViewerScroll} from "./DocxScrollContext"
import DocxZoom from "./DocxZoom"
import {DOCX_VIEWER_CLASS} from "./docxViewerConstants"
import type {PanelMode} from "@/types"

export default function DocxPageColumn() {
  const mode: PanelMode = useContext(PanelContext)
  const {docVer} = useCurrentDocVer()
  const {scrollRef, setPageMeta, pageCount} = useDocxViewerScroll()
  const zoomFactor = useAppSelector(s => selectZoomFactor(s, mode))

  const firstPage = useMemo(() => {
    const pages = docVer?.pages.slice().sort((a, b) => a.number - b.number)
    return pages?.[0]
  }, [docVer?.pages])

  const objectURL = useAppSelector(s =>
    firstPage ? selectBestImageByPageId(s, firstPage.id) : undefined
  )

  if (!docVer || !firstPage || !objectURL) {
    return <Loader />
  }

  const pageBody = (
    <div className={docxClasses.docxPageSlot}>
      <div className={docxClasses.docxPane}>
        <DocxPreviewCore
          objectURL={objectURL}
          embedScroll={false}
          previewClassName={DOCX_VIEWER_CLASS}
          wrapClassName={docxClasses.docxHost}
          zoomFactor={zoomFactor}
          onPagesReady={setPageMeta}
        />
      </div>
    </div>
  )

  return (
    <div className={docxClasses.docxViewerRoot}>
      <PageList
        ref={scrollRef}
        pageItems={[pageBody]}
        paginationInProgress={pageCount === 0}
        zoom={<DocxZoom />}
      />
    </div>
  )
}
