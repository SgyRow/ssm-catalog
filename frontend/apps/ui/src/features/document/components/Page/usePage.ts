import {useAppSelector} from "@/app/hooks"
import PanelContext from "@/contexts/PanelContext"
import {selectBestImageByPageId} from "@/features/document/store/selectors"
import {selectDocumentCurrentPage} from "@/features/ui/uiSlice"
import {PanelMode} from "@/types"
import {RefObject, useContext, useEffect, useRef} from "react"

interface Args {
  pageNumber: number
  pageID: string
}

interface PageState {
  ref: RefObject<HTMLImageElement | null>
  imageURL: string | undefined
  isLoading: boolean
}

export default function usePage({pageNumber, pageID}: Args): PageState {
  const mode: PanelMode = useContext(PanelContext)
  const currentPage = useAppSelector(s => selectDocumentCurrentPage(s, mode))
  const targetRef = useRef<HTMLImageElement | null>(null)
  const bestImageURL = useAppSelector(s => selectBestImageByPageId(s, pageID))

  useEffect(() => {
    if (currentPage !== pageNumber || !targetRef.current) {
      return
    }

    const target = targetRef.current
    const container = target.closest(".page-list")
    if (container && container instanceof HTMLElement) {
      const targetRect = target.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const offsetTop = targetRect.top - containerRect.top + container.scrollTop
      const centeredScrollTop =
        offsetTop - container.clientHeight / 2 + targetRect.height / 2
      container.scrollTo({
        top: Math.max(0, centeredScrollTop)
      })
      return
    }

    target.scrollIntoView({
      block: "nearest",
      inline: "nearest"
    })
  }, [currentPage, pageNumber])

  return {
    ref: targetRef,
    isLoading: !bestImageURL,
    imageURL: bestImageURL
  }
}
