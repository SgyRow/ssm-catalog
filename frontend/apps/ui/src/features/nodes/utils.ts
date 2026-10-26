import type {NodeType, SortMenuColumn, SortMenuDirection} from "@/types"

import {SUPPORTED_EXTENSIONS, SUPPORTED_MIME_TYPES} from "./constants"

function fileExtensionFromTitle(title: string): string {
  const match = title.match(/\.([^.]+)$/)
  return match ? match[1].toLowerCase() : ""
}

/** Client-side sort matching commander list order (see nodes db ORDER_BY_MAP). */
function sortCommanderNodes(
  items: NodeType[],
  column: SortMenuColumn,
  direction: SortMenuDirection
): NodeType[] {
  const mult = direction === "az" ? 1 : -1
  const sorted = [...items]
  sorted.sort((a, b) => {
    let cmp = 0
    switch (column) {
      case "title":
        cmp = a.title.localeCompare(b.title, undefined, {sensitivity: "base"})
        break
      case "file_type": {
        const extA = fileExtensionFromTitle(a.title)
        const extB = fileExtensionFromTitle(b.title)
        cmp = extA.localeCompare(extB, undefined, {sensitivity: "base"})
        if (cmp === 0) {
          cmp = a.title.localeCompare(b.title, undefined, {sensitivity: "base"})
        }
        break
      }
      case "created_at": {
        const createdA =
          "created_at" in a && typeof a.created_at === "string"
            ? a.created_at
            : ""
        const createdB =
          "created_at" in b && typeof b.created_at === "string"
            ? b.created_at
            : ""
        cmp = createdA.localeCompare(createdB)
        break
      }
      case "updated_at":
        cmp = a.update_at.localeCompare(b.update_at)
        break
    }
    return cmp * mult
  })
  return sorted
}

function isSupportedFile(file: File): boolean {
  const typeOk = SUPPORTED_MIME_TYPES.includes(file.type.toLowerCase())

  const extension = file.name.split(".").pop()?.toLowerCase() || ""
  const extOk = SUPPORTED_EXTENSIONS.includes(`.${extension}`)

  // Accept if either type or extension match (extension is fallback)
  return typeOk || extOk
}

export {isSupportedFile, sortCommanderNodes}
