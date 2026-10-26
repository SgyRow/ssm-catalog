import {useAppDispatch} from "@/app/hooks"
import PanelContext from "@/contexts/PanelContext"
import {
  viewerCurrentPageUpdated,
  zoomFactorDecremented,
  zoomFactorIncremented,
  zoomFactorReseted
} from "@/features/ui/uiSlice"
import type {PanelMode} from "@/types"
import {useContext} from "react"
import {Zoom} from "viewer"

import {useDocxViewerScroll} from "./DocxScrollContext"

export default function DocxZoom() {
  const mode: PanelMode = useContext(PanelContext)
  const dispatch = useAppDispatch()
  const {currentPageNumber, pageCount, sectionsRef} = useDocxViewerScroll()

  const onPageNumberSubmit = (nextPageNumber: number) => {
    dispatch(
      viewerCurrentPageUpdated({
        panel: mode,
        pageNumber: nextPageNumber
      })
    )
    sectionsRef.current[nextPageNumber - 1]?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    })
  }

  return (
    <Zoom
      pageNumber={currentPageNumber}
      pageTotal={pageCount || 1}
      onFitClick={() => dispatch(zoomFactorReseted(mode))}
      onZoomInClick={() => dispatch(zoomFactorIncremented(mode))}
      onZoomOutClick={() => dispatch(zoomFactorDecremented(mode))}
      onPageNumberSubmit={onPageNumberSubmit}
    />
  )
}
