import type {BlobViewerCategory} from "@/features/document/documentPreview"
import {Checkbox, Stack, ThemeIcon} from "@mantine/core"
import {
  IconFile,
  IconFileText,
  IconFileTypeDoc,
  IconMusic,
  IconPhoto,
  IconVideo
} from "@tabler/icons-react"
import clsx from "clsx"
import {forwardRef} from "react"
import classes from "./MediaThumbnail.module.css"

interface MediaThumbnailArgs {
  pageNumber: number
  category: BlobViewerCategory
  showCheckbox?: boolean
  checked?: boolean
  isDragged?: boolean
  withBorderTop?: boolean
  withBorderBottom?: boolean
  height?: number
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void
  onDragEnd?: () => void
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void
  onDragLeave?: (event: React.DragEvent<HTMLDivElement>) => void
  onDragEnter?: (event: React.DragEvent<HTMLDivElement>) => void
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void
  onClick?: () => void
}

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
    default:
      return IconFile
  }
}

export const MediaThumbnail = forwardRef<HTMLDivElement, MediaThumbnailArgs>(
  (
    {
      pageNumber,
      category,
      showCheckbox = true,
      checked = false,
      isDragged = false,
      withBorderBottom = false,
      withBorderTop = false,
      height = 160,
      onChange,
      onDragStart,
      onDragEnd,
      onDragOver,
      onDragLeave,
      onDragEnter,
      onDrop,
      onClick
    },
    ref
  ) => {
    const Icon = categoryIcon(category)
    const className = clsx(classes.thumbnail, classes.checkbox, {
      [classes.dragged]: isDragged,
      [classes.borderlineTop]: withBorderTop,
      [classes.borderlineBottom]: withBorderBottom
    })

    return (
      <Stack
        ref={ref}
        align="center"
        gap="xs"
        draggable
        onClick={onClick}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDragEnter={onDragEnter}
        onDrop={onDrop}
        className={`thumbnail ${className}`}
        style={{minHeight: height}}
      >
        {showCheckbox && (
          <Checkbox
            onChange={onChange}
            checked={checked}
            className={classes.checkbox}
            onClick={event => event.stopPropagation()}
          />
        )}
        <div style={{cursor: "pointer", textAlign: "center"}}>
          <ThemeIcon variant="light" size="xl" radius="md">
            <Icon size={28} />
          </ThemeIcon>
          <div>{pageNumber}</div>
        </div>
      </Stack>
    )
  }
)

MediaThumbnail.displayName = "MediaThumbnail"

export default MediaThumbnail
