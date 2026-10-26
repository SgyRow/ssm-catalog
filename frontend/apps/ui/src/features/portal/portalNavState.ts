export type PortalDocumentNavState = {
  documentReturnToPortal: true
  portalRootId: string
  portalRootLabel: string
}

export function isPortalDocumentNavState(
  v: unknown
): v is PortalDocumentNavState {
  if (!v || typeof v !== "object") {
    return false
  }
  const o = v as Record<string, unknown>
  return (
    o.documentReturnToPortal === true &&
    typeof o.portalRootId === "string" &&
    typeof o.portalRootLabel === "string"
  )
}

export function makePortalDocumentNavState(root: {
  id: string
  title: string
}): PortalDocumentNavState {
  return {
    documentReturnToPortal: true,
    portalRootId: root.id,
    portalRootLabel: root.title
  }
}
