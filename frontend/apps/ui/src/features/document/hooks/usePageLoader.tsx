import {useCallback, useEffect, useState} from "react"

interface State {
  loadMore: boolean
}

interface Args {
  containerRef: React.RefObject<HTMLElement | null>
  cssSelector: string
  totalPageCount?: number
  loadedPageCount?: number
}

/**
 *
 * @param totalPageCount total number of pages in the document version
 * @param containerRef Reference to the container which contains page components
 * @param cssSelector css selector for the container child elements to consider
 * @returns `loadMore` state which may be `true` or `false` depending
 *  if there are (or not) more pages to load. There are more pages
 * to load only when user scrolled to the very bottom of the container
 * and number of pages present in container is less than the total pages of
 * the document version
 */
export default function usePageLoader({
  containerRef,
  cssSelector,
  totalPageCount,
  loadedPageCount = 0
}: Args): State {
  const [loadMore, setLoadMore] = useState(false)

  const checkIfLastElementVisible = useCallback(() => {
    /** triggered on scroll and and resize events of the container */
    if (!containerRef) {
      return
    }
    if (!totalPageCount) {
      return
    }
    const container = containerRef.current
    if (!container) return

    const pageElements = container.querySelectorAll<HTMLElement>(cssSelector)
    if (pageElements.length === 0) {
      return
    }

    const nearBottomPx = 48
    const reachedBottom =
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - nearBottomPx
    setLoadMore(reachedBottom)
  }, [containerRef, cssSelector, totalPageCount, loadedPageCount])

  useEffect(() => {
    if (!containerRef) {
      return
    }

    const container = containerRef.current
    if (!container) {
      return
    }

    checkIfLastElementVisible()

    container.addEventListener("scroll", checkIfLastElementVisible)
    window.addEventListener("resize", checkIfLastElementVisible)

    return () => {
      container.removeEventListener("scroll", checkIfLastElementVisible)
      window.removeEventListener("resize", checkIfLastElementVisible)
    }
  }, [checkIfLastElementVisible])

  useEffect(() => {
    checkIfLastElementVisible()
  }, [checkIfLastElementVisible, loadedPageCount])

  return {loadMore}
}
