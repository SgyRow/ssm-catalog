import {Loader, Stack} from "@mantine/core"
import {forwardRef} from "react"
import classes from "./PageList.module.css"

interface Args {
  pageItems: Array<React.ReactNode>
  paginationInProgress: boolean
  /** Omit for viewers that do not use zoom chrome (e.g. DOCX). */
  zoom?: React.ReactNode
}

export const PageList = forwardRef<HTMLDivElement, Args>(
  ({zoom, pageItems, paginationInProgress}, ref) => {
    return (
      <div className={classes.pageListRoot}>
        <div ref={ref} className={`${classes.pages} page-list`}>
          <Stack justify="flex-start" className={classes.pageItems}>
            {pageItems}
            {paginationInProgress && (
              <Loader className={classes.pageListLoader} type="oval" />
            )}
          </Stack>
        </div>
        {zoom && <div className={classes.zoomDock}>{zoom}</div>}
      </div>
    )
  }
)

PageList.displayName = "PageList"

export default PageList
