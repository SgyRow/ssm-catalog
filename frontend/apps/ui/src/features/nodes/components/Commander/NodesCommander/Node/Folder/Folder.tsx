import {useAppDispatch, useAppSelector} from "@/app/hooks"
import {Checkbox, Stack, Tooltip} from "@mantine/core"
import {useDisclosure} from "@mantine/hooks"
import {IconUsers} from "@tabler/icons-react"
import {useContext, useState} from "react"

import {
  commanderSelectionNodeAdded,
  commanderSelectionNodeRemoved,
  dragNodesStarted,
  selectCurrentNodeID,
  selectDraggedNodes,
  selectDraggedNodesSourceFolderID,
  selectSelectedNodeIds
} from "@/features/ui/uiSlice"

import DropNodesModal from "@/features/nodes/components/Commander/NodesCommander/DropNodesDialog"
import Tags from "@/features/nodes/components/Commander/NodesCommander/Node/Tags"
import NodeVisibilityIcon from "@/features/nodes/components/Commander/NodesCommander/Node/NodeVisibilityIcon"
import type {NodeType, PanelMode} from "@/types"
import classes from "./Folder.module.scss"
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

export default function Folder({
  node,
  onClick,
  onDrag,
  onDragStart,
  cssClassNames,
  reorderMode = false,
  isReorderDragging = false,
  onReorderPointerDown
}: Args) {
  const [dropNodesOpened, {open: dropNodesOpen, close: dropNodesClose}] =
    useDisclosure(false)
  const [dragOver, setDragOver] = useState<boolean>(false)
  const mode: PanelMode = useContext(PanelContext)
  const selectedIds = useAppSelector(s =>
    selectSelectedNodeIds(s, mode)
  ) as Array<string>
  const currentFolderID = useAppSelector(s => selectCurrentNodeID(s, mode))
  const dispatch = useAppDispatch()
  const tagNames = node.tags.map(t => t.name)
  const draggedNodes = useAppSelector(selectDraggedNodes)
  const draggedNodesSourceFolderID = useAppSelector(
    selectDraggedNodesSourceFolderID
  )

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

  const onLocalDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (reorderMode) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    setDragOver(!draggedNodes.some(item => item.id === node.id))
  }

  const onLocalDragLeave = () => {
    setDragOver(false)
  }

  const onLocalDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (reorderMode) {
      return
    }
    event.preventDefault()
    setDragOver(true)
  }

  const onLocalDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (reorderMode) {
      return
    }
    event.stopPropagation()
    setDragOver(false)

    // A folder cannot be moved into itself. Do not even open the
    // confirmation dialog for this invalid drop target.
    if (draggedNodes.some(item => item.id === node.id)) {
      return
    }

    dropNodesOpen()
  }

  const onPointerDown = (event: React.PointerEvent) => {
    if (!reorderMode || !onReorderPointerDown) {
      return
    }
    onReorderPointerDown(event, node.id)
  }

  const nodeClass = [
    classes.folder,
    ...cssClassNames,
    dragOver && !reorderMode ? classes.acceptFolder : "",
    reorderMode ? nodeClasses.reorder : "",
    isReorderDragging ? nodeClasses.reorderDragging : ""
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <>
      <Stack
        className={nodeClass}
        draggable={!reorderMode}
        data-node-id={node.id}
        onPointerDown={onPointerDown}
        onDragStart={onDragStartLocal}
        onDrag={onDragLocal}
        onDragEnd={onDragEnd}
        onDragOver={onLocalDragOver}
        onDragLeave={onLocalDragLeave}
        onDragEnter={onLocalDragEnter}
        onDrop={onLocalDrop}
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
          <div className={classes.folderIcon}></div>
          {node.is_shared && <IconUsers className={classes.iconUsers} />}
          <Tags names={tagNames} node={node} />
          <div className={classes.title}>
            <NodeVisibilityIcon summary={node.visibility_summary} />
            <Tooltip label={node.title}>
              <span>{node.title}</span>
            </Tooltip>
          </div>
        </a>
      </Stack>
      {draggedNodesSourceFolderID && (
        <DropNodesModal
          sourceNodes={draggedNodes}
          targetFolder={node}
          sourceFolderID={draggedNodesSourceFolderID}
          opened={dropNodesOpened}
          onSubmit={dropNodesClose}
          onCancel={dropNodesClose}
        />
      )}
    </>
  )
}
