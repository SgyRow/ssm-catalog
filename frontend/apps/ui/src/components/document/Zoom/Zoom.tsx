import {useAppDispatch} from "@/app/hooks"
import PanelContext from "@/contexts/PanelContext"
import {ensurePreviewForPage} from "@/features/document/actions"
import {useCurrentDocVer} from "@/features/document/hooks"
import {
  viewerCurrentPageUpdated,
  zoomFactorDecremented,
  zoomFactorIncremented,
  zoomFactorReseted
} from "@/features/ui/uiSlice"
import type {PanelMode} from "@/types"
import {useContext} from "react"
import {Zoom} from "viewer"

interface Args {
  pageNumber: number
  pageTotal: number
}

export default function ZoomContainer({pageNumber, pageTotal}: Args) {
  const mode: PanelMode = useContext(PanelContext)
  const dispatch = useAppDispatch()
  const {docVer} = useCurrentDocVer()

  const incZoom = () => {
    dispatch(zoomFactorIncremented(mode))
  }
  const decZoom = () => {
    dispatch(zoomFactorDecremented(mode))
  }

  const fitZoom = () => {
    dispatch(zoomFactorReseted(mode))
  }

  const updatePageNumber = (nextPageNumber: number) => {
    dispatch(
      ensurePreviewForPage({
        docVer,
        targetPageNumber: nextPageNumber,
        size: "md"
      })
    )
    dispatch(
      viewerCurrentPageUpdated({
        panel: mode,
        pageNumber: nextPageNumber
      })
    )
  }

  return (
    <Zoom
      pageNumber={pageNumber}
      pageTotal={pageTotal}
      onFitClick={fitZoom}
      onZoomInClick={incZoom}
      onZoomOutClick={decZoom}
      onPageNumberSubmit={updatePageNumber}
    />
  )
}
