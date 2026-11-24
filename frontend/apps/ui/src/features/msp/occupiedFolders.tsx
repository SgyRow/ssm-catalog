import {useGetPortalNodesQuery} from "@/features/portal/portalApiSlice"
import type {NodeType} from "@/types"
import {useCallback, useEffect, useState, type ReactNode} from "react"

export const INFORMATION_FOLDER = "Информационные материалы"

export function folderHasDocument(items: NodeType[]): boolean {
  return items.some(item => item.ctype === "document")
}

function FolderOccupancyProbe({
  folderId,
  onResolved
}: {
  folderId: string
  onResolved: (folderId: string, occupied: boolean) => void
}) {
  const {data, isSuccess, isError} = useGetPortalNodesQuery({
    parentId: folderId,
    page_size: 100
  })
  const occupied = folderHasDocument(data?.items ?? [])

  useEffect(() => {
    if (isSuccess || isError) {
      onResolved(folderId, isSuccess && occupied)
    }
  }, [folderId, isSuccess, isError, occupied, onResolved])

  return null
}

/**
 * Drops folders that do not contain a document. Unresolved folders stay
 * visible (optimistic) so callers can render immediately; `pending` is
 * true until every folder probe finishes. When `enabled` is false every
 * node stays visible.
 */
export function HideEmptyFolders({
  items,
  enabled,
  children
}: {
  items: NodeType[]
  enabled: boolean
  children: (state: {pending: boolean; visible: NodeType[]}) => ReactNode
}) {
  const [occupied, setOccupied] = useState<Record<string, boolean>>({})
  const onResolved = useCallback((folderId: string, hasDocument: boolean) => {
    setOccupied(prev =>
      prev[folderId] === hasDocument ? prev : {...prev, [folderId]: hasDocument}
    )
  }, [])

  const folders = enabled ? items.filter(item => item.ctype === "folder") : []
  const pending =
    enabled && folders.some(folder => occupied[folder.id] === undefined)
  // Optimistic: keep unresolved folders visible so the section can render
  // immediately; hide only after a probe confirms the folder is empty.
  const visible = enabled
    ? items.filter(
        item => item.ctype !== "folder" || occupied[item.id] !== false
      )
    : items

  return (
    <>
      {folders.map(folder => (
        <FolderOccupancyProbe
          key={folder.id}
          folderId={folder.id}
          onResolved={onResolved}
        />
      ))}
      {children({pending, visible})}
    </>
  )
}
