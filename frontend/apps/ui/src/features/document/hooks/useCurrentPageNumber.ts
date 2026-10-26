import {useCallback, useEffect, useState} from "react"

interface State {
  currentPageNumber: number
}

interface Args {
  containerRef: React.RefObject<HTMLElement | null>
  /** When set, page nodes are queried here (e.g. docx iframe document). */
  queryRootRef?: React.RefObject<Document | ParentNode | null>
  cssSelector: string
  initialPageNumber?: number
}

export default function useCurrentPageNumber({
  containerRef,
  queryRootRef,
  cssSelector,
  initialPageNumber = 1
}: Args): State {
  const [currentPage, setCurrentPage] = useState(initialPageNumber)

  const checkCurrentPage = useCallback(() => {
    const container = containerRef.current
    const queryRoot = queryRootRef?.current
    if (!container) return

    const pageElements = (
      queryRoot ?? container
    ).querySelectorAll<HTMLElement>(cssSelector)
    if (pageElements.length === 0) {
      return
    }

    const containerRect = container.getBoundingClientRect()
    const containerMidPoint = containerRect.top + containerRect.height / 2

    const pageList = Array.from(pageElements)
    const currentIndex = pageList.findIndex(el => {
      const elRect = el.getBoundingClientRect()
      return (
        elRect.top <= containerMidPoint && elRect.bottom >= containerMidPoint
      )
    })

    if (currentIndex !== -1) {
      setCurrentPage(currentIndex + 1)
      return
    }

    let closestIndex = 0
    let closestDistance = Number.POSITIVE_INFINITY
    pageList.forEach((el, index) => {
      const elRect = el.getBoundingClientRect()
      const pageMidPoint = elRect.top + elRect.height / 2
      const distance = Math.abs(pageMidPoint - containerMidPoint)
      if (distance < closestDistance) {
        closestDistance = distance
        closestIndex = index
      }
    })
    setCurrentPage(closestIndex + 1)
  }, [containerRef, queryRootRef])

  useEffect(() => {
    if (!containerRef) {
      return
    }

    const container = containerRef.current
    if (!container) {
      return
    }

    checkCurrentPage()

    container.addEventListener("scroll", checkCurrentPage)
    window.addEventListener("resize", checkCurrentPage)

    return () => {
      container.removeEventListener("scroll", checkCurrentPage)
      window.removeEventListener("resize", checkCurrentPage)
    }
  }, [checkCurrentPage])

  return {currentPageNumber: currentPage}
}
