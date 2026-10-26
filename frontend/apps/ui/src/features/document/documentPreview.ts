/** How the viewer renders the latest document version (by file name). */
export type BlobViewerCategory =
  | "pdf-pages"
  | "video"
  | "audio"
  | "image"
  | "text"
  | "html"
  | "docx"
  /** RTF: plain-text preview (formatting not preserved). */
  | "rtf"
  /** Legacy binary Microsoft Word (.doc); not previewable in the browser. */
  | "word-doc"
  | "binary"

const PDF_PAGE_EXTENSIONS = new Set([
  ".pdf"
])

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".webm",
  ".ogg",
  ".ogv",
  ".mov",
  ".m4v",
  ".mkv"
])

const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".oga",
  ".ogg",
  ".opus",
  ".m4a",
  ".aac",
  ".flac"
])

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".tif",
  ".tiff",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".avif"
])

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".text",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".xml",
  ".log",
  ".ini",
  ".env",
  ".yml",
  ".yaml",
  ".css",
  ".scss",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".sh",
  ".bat",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".java",
  ".go",
  ".rs",
  ".sql"
])

const HTML_EXTENSIONS = new Set([".html", ".htm"])

const DOCX_EXTENSIONS = new Set([".docx"])

/** Extensions for which the backend creates a PDF version on upload. */
const UPLOAD_PDF_CONVERSION_EXTENSIONS = new Set([
  ".docx",
  ".jpg",
  ".jpeg",
  ".png",
  ".tif",
  ".tiff"
])

const RTF_EXTENSIONS = new Set([".rtf"])

const LEGACY_WORD_DOC_EXTENSIONS = new Set([".doc"])

export function getFileExtension(fileName: string | null | undefined): string {
  if (!fileName) {
    return ""
  }
  const lower = fileName.toLowerCase()
  const dot = lower.lastIndexOf(".")
  return dot >= 0 ? lower.slice(dot) : ""
}

/**
 * Split on the last dot (same rule as {@link getFileExtension}).
 * `ext` includes the leading dot. For dotfiles like `.gitignore`, stem is empty
 * and `ext` is the full file name.
 */
export function splitStemAndExtension(fileName: string): {
  stem: string
  ext: string
} {
  const lower = fileName.toLowerCase()
  const dot = lower.lastIndexOf(".")
  if (dot < 0) {
    return {stem: fileName, ext: ""}
  }
  return {
    stem: dot === 0 ? "" : fileName.slice(0, dot),
    ext: fileName.slice(dot)
  }
}

/** Edited base name + original extension (preview routing depends on extension). */
export function buildFileNameWithOriginalExtension(
  originalFileName: string,
  editedStem: string
): string {
  const {ext} = splitStemAndExtension(originalFileName)
  const stem = editedStem.trim()
  return ext ? `${stem}${ext}` : stem
}

/** False e.g. when the user cleared the name but a non-dotfile had an extension. */
export function isAcceptableUploadStem(
  originalFileName: string,
  editedStem: string
): boolean {
  const full = buildFileNameWithOriginalExtension(originalFileName, editedStem)
  if (!full.trim()) {
    return false
  }
  const {stem: origStem, ext} = splitStemAndExtension(originalFileName)
  if (ext && origStem.length > 0 && editedStem.trim().length === 0) {
    return false
  }
  return true
}

/** PDF-style viewer: page thumbnails, zoom, multi-page canvas. */
export function isPdfStyleViewer(fileName: string | null | undefined): boolean {
  return getBlobViewerCategory(fileName) === "pdf-pages"
}

export type ViewerChromeKind = "native-pdf" | "docx" | "blob"

/** Browser-native PDF preview (iframe) vs custom viewers for other formats. */
export function usesNativePdfPreview(
  fileName: string | null | undefined
): boolean {
  return getViewerChromeKind(fileName) === "native-pdf"
}

/** Which main viewer shell to use (native PDF/media iframe vs docx vs blob pane). */
export function getViewerChromeKind(
  fileName: string | null | undefined
): ViewerChromeKind {
  const cat = getBlobViewerCategory(fileName)
  if (cat === "pdf-pages" || cat === "image") {
    return "native-pdf"
  }
  if (cat === "docx") {
    return "docx"
  }
  return "blob"
}

/**
 * Formats where text is already available (or OCR does not apply).
 * Used to hide upload OCR prompt and "Run OCR" in the viewer.
 */
export function isBuiltinTextDocument(
  fileName: string | null | undefined
): boolean {
  const cat = getBlobViewerCategory(fileName)
  return (
    cat === "video" ||
    cat === "audio" ||
    cat === "text" ||
    cat === "html" ||
    cat === "docx" ||
    cat === "rtf" ||
    cat === "word-doc"
  )
}

/** True when upload triggers server-side PDF conversion (docx or raster images). */
export function uploadConvertsToPdf(
  fileName: string | null | undefined
): boolean {
  return UPLOAD_PDF_CONVERSION_EXTENSIONS.has(getFileExtension(fileName))
}

/** Whether the upload dialog should offer scheduling OCR for this file. */
export function isOcrCandidateFile(
  fileName: string | null | undefined
): boolean {
  if (!fileName) {
    return true
  }
  return !isBuiltinTextDocument(fileName)
}

const ARCHIVE_EXTENSIONS = new Set([
  ".zip",
  ".rar",
  ".7z",
  ".gz",
  ".tar",
  ".bz2",
  ".xz"
])

/** Hide OCR language row in document details for formats where it is irrelevant. */
export function shouldHideOcrLanguageInDetails(
  fileName: string | null | undefined
): boolean {
  if (!fileName) {
    return false
  }
  if (isBuiltinTextDocument(fileName)) {
    return true
  }
  return ARCHIVE_EXTENSIONS.has(getFileExtension(fileName))
}

export function getBlobViewerCategory(
  fileName: string | null | undefined
): BlobViewerCategory {
  const ext = getFileExtension(fileName)
  if (PDF_PAGE_EXTENSIONS.has(ext)) {
    return "pdf-pages"
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    return "video"
  }
  if (AUDIO_EXTENSIONS.has(ext)) {
    return "audio"
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return "image"
  }
  if (DOCX_EXTENSIONS.has(ext)) {
    return "docx"
  }
  if (RTF_EXTENSIONS.has(ext)) {
    return "rtf"
  }
  if (LEGACY_WORD_DOC_EXTENSIONS.has(ext)) {
    return "word-doc"
  }
  if (HTML_EXTENSIONS.has(ext)) {
    return "html"
  }
  if (TEXT_EXTENSIONS.has(ext)) {
    return "text"
  }
  return "binary"
}

/** MIME for Blob / media elements; best-effort from extension. */
export function guessMimeTypeFromFileName(
  fileName: string | null | undefined
): string {
  const ext = getFileExtension(fileName)
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".avif": "image/avif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".ogv": "video/ogg",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".mkv": "video/x-matroska",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".oga": "audio/ogg",
    ".ogg": "audio/ogg",
    ".opus": "audio/opus",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".tsv": "text/tab-separated-values",
    ".json": "application/json",
    ".xml": "application/xml",
    ".html": "text/html",
    ".htm": "text/html",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx":
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
    ".odp": "application/vnd.oasis.opendocument.presentation",
    ".rtf": "application/rtf",
    ".zip": "application/zip"
  }
  return map[ext] || "application/octet-stream"
}
