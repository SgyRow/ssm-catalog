import type {NodeType} from "@/types"
import {equalUUIDs} from "@/utils"

export function isPortalSearchNode(
  nodeId: string,
  portalRootId: string | undefined,
  searchNodes: Record<string, NodeType | undefined>
): boolean {
  if (!portalRootId) {
    return false
  }

  if (equalUUIDs(nodeId, portalRootId)) {
    return true
  }

  const details = searchNodes[nodeId]
  if (details?.breadcrumb?.length) {
    return equalUUIDs(details.breadcrumb[0][0], portalRootId)
  }

  for (const node of Object.values(searchNodes)) {
    if (!node?.breadcrumb?.length) {
      continue
    }
    if (!equalUUIDs(node.breadcrumb[0][0], portalRootId)) {
      continue
    }
    if (node.breadcrumb.some(([id]) => equalUUIDs(id, nodeId))) {
      return true
    }
  }

  return false
}
