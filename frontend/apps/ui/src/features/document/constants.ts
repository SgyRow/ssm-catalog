/** How many pages (previews) will client extract, for Pages Component,
 * from PDF file in one shot */
export const DOC_VER_PAGINATION_PAGE_BATCH_SIZE = 2
/** How many pages (i.e. previews) will client extract, for Thumbnails Component,
 * from PDF file in one shot */
export const DOC_VER_PAGINATION_THUMBNAIL_BATCH_SIZE = 3
export const APP_THUMBNAIL_VALUE = "app-thumbnail"
export const APP_THUMBNAIL_KEY = "text/app-thumbnail"
/**
 * Temporary kill-switch for all mutating actions in document viewer.
 * Keep false to make viewer effectively read-only.
 */
export const VIEWER_FILE_EDITING_ENABLED = false
