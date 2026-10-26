import {useAppSelector} from "@/app/hooks"
import {DRAGGED} from "@/cconstants"
import {selectDraggedNodeIDs} from "@/features/ui/uiSlice"
import type {NodeType} from "@/types"
import {useEffect, useState} from "react"
import Document from "./Document/Document"
import Folder from "./Folder/Folder"

type Args = {
  node: NodeType
  onClick: (node: NodeType) => void
  onDragStart: (nodeID: string, event: React.DragEvent) => void
  onDrag: (nodeID: string, event: React.DragEvent) => void
  reorderMode?: boolean
  isReorderDragging?: boolean
  onReorderPointerDown?: (event: React.PointerEvent, nodeID: string) => void
}

export default function Node({
  node,
  onClick,
  onDrag,
  onDragStart,
  reorderMode = false,
  isReorderDragging = false,
  onReorderPointerDown
}: Args) {
  const [cssClassNames, setCssClassNames] = useState<Array<string>>([])
  const draggedNodesIDs = useAppSelector(selectDraggedNodeIDs)

  useEffect(() => {
    const names: string[] = []
    const node_is_being_dragged = draggedNodesIDs?.includes(node.id)
    if (node_is_being_dragged && !reorderMode) {
      names.push(DRAGGED)
    }
    setCssClassNames(names)
  }, [draggedNodesIDs?.length, node.id, reorderMode])

  if (node.ctype == "folder") {
    return (
      <Folder
        onClick={onClick}
        node={node}
        onDrag={onDrag}
        onDragStart={onDragStart}
        cssClassNames={cssClassNames}
        reorderMode={reorderMode}
        isReorderDragging={isReorderDragging}
        onReorderPointerDown={onReorderPointerDown}
      />
    )
  }

  return (
    <Document
      onClick={onClick}
      node={node}
      onDrag={onDrag}
      onDragStart={onDragStart}
      cssClassNames={cssClassNames}
      reorderMode={reorderMode}
      isReorderDragging={isReorderDragging}
      onReorderPointerDown={onReorderPointerDown}
    />
  )
}
