import {useAppDispatch, useAppSelector} from "@/app/hooks"
import {apiSlice} from "@/features/api/slice"
import {
  Box,
  Group,
  Loader,
  Text,
  Tree,
  type RenderTreeNodePayload,
  type TreeNodeData,
  useTree
} from "@mantine/core"
import {IconChevronRight, IconFile, IconFolder} from "@tabler/icons-react"
import {useCallback, useEffect, useRef, useState} from "react"
import {useTranslation} from "react-i18next"
import {useNavigate} from "react-router-dom"

import {useLazyGetPortalNodesQuery} from "@/features/portal/portalApiSlice"
import {
  HOME_FOLDER_TREE_WIDTH_MAX,
  HOME_FOLDER_TREE_WIDTH_MIN,
  homeFolderTreeWidthSet,
  selectHomeFolderTreeWidth
} from "@/features/ui/uiSlice"
import type {PortalDocumentNavState} from "@/features/portal/portalNavState"
import type {NodeType} from "@/types"

import clsx from "clsx"

import classes from "./PortalFolderTree.module.scss"

function replaceFolderChildren(
  nodes: TreeNodeData[],
  folderId: string,
  newChildren: TreeNodeData[]
): TreeNodeData[] {
  return nodes.map(n => {
    if (n.value === folderId) {
      return {...n, children: newChildren}
    }
    if (n.children?.length) {
      return {
        ...n,
        children: replaceFolderChildren(n.children, folderId, newChildren)
      }
    }
    return n
  })
}

function getFlatValues(data: TreeNodeData[]): string[] {
  return data.reduce<string[]>((acc, item) => {
    acc.push(item.value)
    if (item.children?.length) {
      acc.push(...getFlatValues(item.children))
    }
    return acc
  }, [])
}

async function bfsPortalFolderPath(
  rootId: string,
  targetId: string,
  fetchItems: (parentId: string) => Promise<Array<{id: string; ctype: string}>>
): Promise<string[] | null> {
  if (targetId === rootId) {
    return [rootId]
  }
  const parent = new Map<string, string>()
  const queue: string[] = [rootId]
  const visited = new Set<string>([rootId])
  while (queue.length) {
    const pid = queue.shift()!
    const items = await fetchItems(pid)
    for (const it of items) {
      if (it.ctype !== "folder") {
        continue
      }
      if (visited.has(it.id)) {
        continue
      }
      visited.add(it.id)
      parent.set(it.id, pid)
      if (it.id === targetId) {
        const path: string[] = []
        let cur: string | undefined = targetId
        while (cur) {
          path.unshift(cur)
          if (cur === rootId) {
            break
          }
          cur = parent.get(cur)
        }
        return path
      }
      queue.push(it.id)
    }
  }
  return null
}

type NodeRow = NodeType

export type PortalFolderTreeFolderNav = "portal" | "commander"

type Props = {
  portalRootId: string
  portalRootTitle: string
  currentFolderId: string
  /** Total sidebar height (title + scrollable tree area). */
  height: number | string
  documentNavState: PortalDocumentNavState
  /** Where folder nodes navigate: portal catalog vs dual-panel commander. */
  folderNav?: PortalFolderTreeFolderNav
  /** Required when `folderNav` is `commander` (preserves commander page size). */
  commanderPageSize?: number
}

export default function PortalFolderTree({
  portalRootId,
  portalRootTitle,
  currentFolderId,
  height,
  documentNavState,
  folderNav = "portal",
  commanderPageSize
}: Props) {
  const {t} = useTranslation()
  const dispatch = useAppDispatch()
  const sidebarWidth = useAppSelector(selectHomeFolderTreeWidth)
  const navigate = useNavigate()
  const [trigger] = useLazyGetPortalNodesQuery()
  const [resizeDrag, setResizeDrag] = useState<{
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)
  const [resizePreviewWidth, setResizePreviewWidth] = useState<number | null>(
    null
  )

  const clampTreeWidth = useCallback((w: number) => {
    return Math.min(
      HOME_FOLDER_TREE_WIDTH_MAX,
      Math.max(HOME_FOLDER_TREE_WIDTH_MIN, Math.round(w))
    )
  }, [])
  const loadedRef = useRef(new Set<string>())
  const loadingRef = useRef(new Set<string>())
  const [treeData, setTreeData] = useState<TreeNodeData[]>([])
  const [rootLoading, setRootLoading] = useState(true)
  const portalListingRevision = useAppSelector(state => {
    const entry = apiSlice.endpoints.getPortalNodes.select({
      parentId: currentFolderId,
      page_size: 100
    })(state)
    return entry.fulfilledTimeStamp
  })
  const prevPortalListingRevision = useRef<number | undefined>()

  useEffect(() => {
    prevPortalListingRevision.current = undefined
  }, [currentFolderId])

  const fetchAllPages = useCallback(
    async (parentId: string) => {
      const all: NodeRow[] = []
      let page = 1
      let numPages = 1
      do {
        const res = await trigger({
          parentId,
          page_number: page,
          page_size: 100
        }).unwrap()
        all.push(...res.items)
        numPages = res.num_pages
        page++
      } while (page <= numPages)
      return all
    },
    [trigger]
  )

  const nodeToTreeData = useCallback((n: NodeRow): TreeNodeData => {
    if (n.ctype === "document") {
      return {
        value: n.id,
        label: n.title,
        nodeProps: {"data-ctype": "document"}
      }
    }
    return {
      value: n.id,
      label: n.title,
      nodeProps: {"data-ctype": "folder"},
      children: [
        {
          value: `__lazy__${n.id}`,
          label: "\u200b",
          nodeProps: {"data-placeholder": "true"}
        }
      ]
    }
  }, [])

  const ensureLoaded = useCallback(
    async (folderId: string) => {
      if (loadedRef.current.has(folderId) || loadingRef.current.has(folderId)) {
        return
      }
      loadingRef.current.add(folderId)
      try {
        const items = await fetchAllPages(folderId)
        loadedRef.current.add(folderId)
        const mapped = items.length > 0 ? items.map(nodeToTreeData) : undefined
        setTreeData(prev => replaceFolderChildren(prev, folderId, mapped ?? []))
      } finally {
        loadingRef.current.delete(folderId)
      }
    },
    [fetchAllPages, nodeToTreeData]
  )

  const ensureLoadedRef = useRef(ensureLoaded)
  ensureLoadedRef.current = ensureLoaded

  const tree = useTree({
    initialExpandedState: {[portalRootId]: true},
    onNodeExpand: (value: string) => {
      void ensureLoadedRef.current(value)
    }
  })

  const treeRef = useRef(tree)
  treeRef.current = tree

  useEffect(() => {
    loadedRef.current.clear()
    loadingRef.current.clear()
    setTreeData([])
    setRootLoading(true)
    let cancelled = false
    ;(async () => {
      try {
        const items = await fetchAllPages(portalRootId)
        if (cancelled) {
          return
        }
        loadedRef.current.add(portalRootId)
        setTreeData([
          {
            value: portalRootId,
            label: portalRootTitle,
            nodeProps: {"data-ctype": "folder"},
            children: items.map(nodeToTreeData)
          }
        ])
      } catch {
        if (!cancelled) {
          setTreeData([])
        }
      } finally {
        if (!cancelled) {
          setRootLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [portalRootId, portalRootTitle, fetchAllPages, nodeToTreeData])

  useEffect(() => {
    if (rootLoading || !portalListingRevision) {
      return
    }
    if (prevPortalListingRevision.current === undefined) {
      prevPortalListingRevision.current = portalListingRevision
      return
    }
    if (prevPortalListingRevision.current === portalListingRevision) {
      return
    }
    prevPortalListingRevision.current = portalListingRevision
    let cancelled = false
    ;(async () => {
      loadedRef.current.delete(currentFolderId)
      await ensureLoadedRef.current(currentFolderId)
      if (cancelled) {
        return
      }
    })()
    return () => {
      cancelled = true
    }
  }, [portalListingRevision, currentFolderId, rootLoading])

  useEffect(() => {
    if (!portalRootId || !currentFolderId || rootLoading) {
      return
    }
    let cancelled = false
    ;(async () => {
      const path = await bfsPortalFolderPath(
        portalRootId,
        currentFolderId,
        async pid => {
          const res = await trigger({
            parentId: pid,
            page_number: 1,
            page_size: 100
          }).unwrap()
          /* first page enough for shallow BFS step; deep trees paginate */
          const all: NodeRow[] = [...res.items]
          let page = 2
          let numPages = res.num_pages
          while (page <= numPages) {
            const next = await trigger({
              parentId: pid,
              page_number: page,
              page_size: 100
            }).unwrap()
            all.push(...next.items)
            numPages = next.num_pages
            page++
          }
          return all.map(i => ({id: i.id, ctype: i.ctype}))
        }
      )
      if (cancelled || !path) {
        return
      }
      for (const fid of path) {
        await ensureLoadedRef.current(fid)
      }
      if (cancelled) {
        return
      }
      const ctl = treeRef.current
      for (const fid of path) {
        ctl.expand(fid)
      }
      ctl.select(currentFolderId)
    })()
    return () => {
      cancelled = true
    }
  }, [portalRootId, currentFolderId, rootLoading, trigger])

  useEffect(() => {
    if (!treeData.length) {
      return
    }
    const flat = getFlatValues(treeData)
    if (!flat.includes(currentFolderId)) {
      return
    }
    const ctl = treeRef.current
    if (ctl.selectedState.includes(currentFolderId)) {
      return
    }
    ctl.select(currentFolderId)
  }, [currentFolderId, treeData])

  const onTreeNavigate = useCallback(
    (node: TreeNodeData) => {
      const ctype = node.nodeProps?.["data-ctype"]
      if (ctype === "document") {
        navigate(`/document/${node.value}`, {
          state: folderNav === "commander" ? undefined : documentNavState
        })
        return
      }
      if (folderNav === "commander" && commanderPageSize != null) {
        navigate(`/folder/${node.value}?page_size=${commanderPageSize}`)
        return
      }
      navigate(`/portal/folder/${node.value}`)
    },
    [navigate, documentNavState, folderNav, commanderPageSize]
  )

  const renderTreeNode = useCallback(
    ({
      node,
      expanded,
      hasChildren,
      elementProps,
      tree: tctl
    }: RenderTreeNodePayload) => {
      if (node.nodeProps?.["data-placeholder"] === "true") {
        return (
          <span
            {...elementProps}
            className={clsx(classes.placeholder, elementProps.className)}
            aria-hidden
          />
        )
      }
      const ctype = node.nodeProps?.["data-ctype"]
      const isFolder = ctype === "folder"
      return (
        <Group
          gap={6}
          wrap="nowrap"
          {...elementProps}
          className={clsx(classes.row, elementProps.className)}
        >
          {hasChildren ? (
            <Box
              className={classes.chevron}
              onClick={e => {
                e.stopPropagation()
                tctl.toggleExpanded(node.value)
              }}
            >
              <IconChevronRight
                size={14}
                style={{
                  transform: expanded ? "rotate(90deg)" : undefined,
                  flexShrink: 0
                }}
              />
            </Box>
          ) : (
            <Box w={14} flex="0 0 14px" />
          )}
          <Box
            className={classes.label}
            onClick={e => {
              e.stopPropagation()
              tctl.select(node.value)
              onTreeNavigate(node)
            }}
          >
            <Group gap={6} wrap="nowrap">
              {isFolder ? (
                <IconFolder size={14} className={classes.folderIcon} />
              ) : (
                <IconFile size={14} className={classes.fileIcon} />
              )}
              <Text size="sm" truncate="end" title={String(node.label)}>
                {node.label}
              </Text>
            </Group>
          </Box>
        </Group>
      )
    },
    [onTreeNavigate]
  )

  const effectiveWidth = resizePreviewWidth ?? sidebarWidth

  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setResizeDrag({
      pointerId: e.pointerId,
      startX: e.clientX,
      startWidth: sidebarWidth
    })
    setResizePreviewWidth(null)
  }

  const onResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeDrag || e.pointerId !== resizeDrag.pointerId) {
      return
    }
    const delta = e.clientX - resizeDrag.startX
    setResizePreviewWidth(clampTreeWidth(resizeDrag.startWidth + delta))
  }

  const endResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeDrag || e.pointerId !== resizeDrag.pointerId) {
      return
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* capture may already be released */
    }
    const delta = e.clientX - resizeDrag.startX
    dispatch(homeFolderTreeWidthSet(resizeDrag.startWidth + delta))
    setResizeDrag(null)
    setResizePreviewWidth(null)
  }

  return (
    <Box
      className={classes.sidebar}
      style={{width: effectiveWidth, height}}
    >
      <Text size="sm" fw={600} mb="xs" px="xs" className={classes.title}>
        {t("portal.tree_title")}
      </Text>
      <Box className={classes.scroll}>
        {rootLoading ? (
          <Loader size="sm" ml="xs" />
        ) : (
          <Tree
            tree={tree}
            data={treeData}
            expandOnClick={false}
            selectOnClick={false}
            className={classes.tree}
            renderNode={renderTreeNode}
          />
        )}
      </Box>
      <Box
        className={classes.resizeHandle}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        role="separator"
        aria-orientation="vertical"
        aria-label={t("homeFolderTree.resizeHandle")}
      />
    </Box>
  )
}
