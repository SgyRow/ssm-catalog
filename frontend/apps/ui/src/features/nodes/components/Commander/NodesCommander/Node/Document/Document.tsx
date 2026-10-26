import {useAppDispatch, useAppSelector} from "@/app/hooks"
import {Checkbox, Stack, Tooltip} from "@mantine/core"
import {IconUsers} from "@tabler/icons-react"
import {useContext} from "react"

import {
  commanderSelectionNodeAdded,
  commanderSelectionNodeRemoved,
  dragNodesStarted,
  selectCurrentNodeID,
  selectSelectedNodeIds
} from "@/features/ui/uiSlice"

import Thumbnail from "@/components/NodeThumbnail/Thumbnail"
import Tags from "@/features/nodes/components/Commander/NodesCommander/Node/Tags"
import NodeVisibilityIcon from "@/features/nodes/components/Commander/NodesCommander/Node/NodeVisibilityIcon"
import type {NodeType, PanelMode} from "@/types"
import {formatNodeDisplayTitle} from "@/utils"
import classes from "./Document.module.scss"
import nodeClasses from "../Node.module.scss"

import PanelContext from "@/contexts/PanelContext"

type Args = {
  node: NodeType
  onClick: (node: NodeType) => void
  onDragStart: (nodeID: string, event: React.DragEvent) => void
  onDrag: (nodeID: string, event: React.DragEvent) => void
  cssClassNames: string[]
  reorderMode?: boolean
  isReorderDragging?: boolean
  onReorderPointerDown?: (event: React.PointerEvent, nodeID: string) => void
}

export default function Document({
  node,
  onClick,
  onDrag,
  onDragStart,
  cssClassNames,
  reorderMode = false,
  isReorderDragging = false,
  onReorderPointerDown
}: Args) {
  const mode: PanelMode = useContext(PanelContext)
  const selectedIds = useAppSelector(s =>
    selectSelectedNodeIds(s, mode)
  ) as Array<string>
  const currentFolderID = useAppSelector(s => selectCurrentNodeID(s, mode))

  const dispatch = useAppDispatch()
  const tagNames = node.tags.map(t => t.name)

  const onCheck = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.currentTarget.checked) {
      dispatch(commanderSelectionNodeAdded({itemID: node.id, mode}))
    } else {
      dispatch(commanderSelectionNodeRemoved({itemID: node.id, mode}))
    }
  }

  const onDragStartLocal = (e: React.DragEvent) => {
    if (reorderMode) {
      e.preventDefault()
      return
    }
    const data = {
      nodes: [node.id, ...selectedIds],
      sourceFolderID: currentFolderID!
    }
    dispatch(dragNodesStarted(data))
    onDragStart(node.id, e)
  }

  const onDragEnd = () => {}

  const onDragLocal = (e: React.DragEvent) => {
    onDrag(node.id, e)
  }

  const onPointerDown = (event: React.PointerEvent) => {
    if (!reorderMode || !onReorderPointerDown) {
      return
    }
    onReorderPointerDown(event, node.id)
  }

  const nodeClass = [
    classes.document,
    ...cssClassNames,
    reorderMode ? nodeClasses.reorder : "",
    isReorderDragging ? nodeClasses.reorderDragging : ""
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <Stack
      className={nodeClass}
      draggable={!reorderMode}
      data-node-id={node.id}
      onPointerDown={onPointerDown}
      onDragStart={onDragStartLocal}
      onDrag={onDragLocal}
      onDragEnd={onDragEnd}
    >
      <Checkbox
        onChange={onCheck}
        checked={selectedIds.includes(node.id)}
        style={reorderMode ? {visibility: "hidden"} : undefined}
      />
      <a
        onClick={e => {
          if (reorderMode) {
            e.preventDefault()
            return
          }
          onClick(node)
        }}
      >
        {node.is_shared && <IconUsers className={classes.iconUsers} />}
        <Thumbnail
          nodeID={node.id}
          fileName={node.title}
          serverThumbnailUrl={node.thumbnail_url}
        />
        <Tags names={tagNames} />
        <div className={classes.title}>
          <NodeVisibilityIcon summary={node.visibility_summary} />
          <Tooltip label={node.title}>
            <span>{formatNodeDisplayTitle(node.title, node.ctype)}</span>
          </Tooltip>
        </div>
      </a>
    </Stack>
  )
}
