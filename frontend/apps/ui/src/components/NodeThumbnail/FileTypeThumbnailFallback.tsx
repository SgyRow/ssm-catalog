import type {BlobViewerCategory} from "@/features/document/documentPreview"
import {Box, ThemeIcon} from "@mantine/core"
import {
  IconFile,
  IconFileText,
  IconFileTypeDoc,
  IconMusic,
  IconPhoto,
  IconVideo
} from "@tabler/icons-react"

function categoryIcon(category: BlobViewerCategory) {
  switch (category) {
    case "video":
      return IconVideo
    case "audio":
      return IconMusic
    case "image":
      return IconPhoto
    case "text":
    case "html":
    case "rtf":
      return IconFileText
    case "docx":
    case "word-doc":
      return IconFileTypeDoc
    case "binary":
      return IconFile
    default:
      return IconFile
  }
}

interface Args {
  category: BlobViewerCategory
}

/** Shown when no preview image is available (e.g. server thumbnail 503). */
export default function FileTypeThumbnailFallback({category}: Args) {
  const Icon = categoryIcon(category)
  return (
    <Box
      style={{
        width: 96,
        height: 128,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <ThemeIcon variant="light" size={72} radius="md">
        <Icon size={40} stroke={1.3} />
      </ThemeIcon>
    </Box>
  )
}
