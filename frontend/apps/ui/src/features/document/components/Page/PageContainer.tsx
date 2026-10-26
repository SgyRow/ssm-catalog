import {useCurrentDocVer} from "@/features/document/hooks"
import {
  getBlobViewerCategory,
  getFileExtension
} from "@/features/document/documentPreview"
import {memo} from "react"
import {Page} from "viewer"
import BlobMediaPage from "./BlobMediaPage"
import SelectablePdfPage from "./SelectablePdfPage"
import usePage from "./usePage"

interface Args {
  pageNumber: number
  angle: number
  zoomFactor: number
  pageID: string
}

function PageContainer({
  pageNumber,
  angle,
  pageID,
  zoomFactor
}: Args) {
  const {docVer} = useCurrentDocVer()
  const {ref, isLoading, imageURL} = usePage({pageNumber, pageID})
  const category = getBlobViewerCategory(docVer?.file_name)
  const isPdfDocument = getFileExtension(docVer?.file_name) === ".pdf"

  if (category !== "pdf-pages") {
    return (
      <BlobMediaPage
        pageID={pageID}
        pageNumber={pageNumber}
        zoomFactor={zoomFactor}
        fileName={docVer?.file_name}
      />
    )
  }

  if (isPdfDocument && docVer) {
    return (
      <SelectablePdfPage
        ref={ref}
        docVerId={docVer.id}
        pageNumber={pageNumber}
        angle={angle}
        zoomFactor={zoomFactor}
        fallbackImageURL={imageURL}
        isImageLoading={isLoading}
      />
    )
  }

  return (
    <Page
      ref={ref}
      angle={angle}
      zoomFactor={isPdfDocument ? zoomFactor : 100}
      fitToViewport={!isPdfDocument}
      isLoading={isLoading}
      pageNumber={pageNumber}
      imageURL={imageURL}
    />
  )
}

/**
 * `PageContainer` mounts once per `pageID` inside a virtualized list, but the
 * parent re-renders frequently (scroll position, selection changes, etc.).
 * The props it receives (`pageID`, `pageNumber`, `angle`, `zoomFactor`) are
 * primitives, so `memo` safely cuts re-renders that originate only from a
 * parent state update unrelated to this page.
 */
export default memo(PageContainer)
