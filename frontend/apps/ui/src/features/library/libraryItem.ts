export type LibraryItemRow = {
  node_id: string
  title: string
  ctype: string
  in_portal?: boolean
  msp_id?: string | null
  type_section_id?: string | null
}

export const MSP_SECTION_CTYPE = "msp_section"
export const MSP_SECTION_HASH_PREFIX = "msp-section-"

export function libraryItemKey(row: LibraryItemRow): string {
  if (row.type_section_id && row.msp_id) {
    return `${row.msp_id}:${row.type_section_id}`
  }
  return row.node_id
}

export function isMspSectionRow(row: LibraryItemRow): boolean {
  return Boolean(row.type_section_id && row.msp_id)
}

export function libraryItemHref(row: LibraryItemRow): string {
  if (isMspSectionRow(row)) {
    return `/portal/folder/${row.node_id}#${MSP_SECTION_HASH_PREFIX}${row.type_section_id}`
  }
  if (row.ctype === "folder") {
    return row.in_portal
      ? `/portal/folder/${row.node_id}`
      : `/folder/${row.node_id}`
  }
  return `/document/${row.node_id}`
}

export function mspSectionHashId(typeSectionId: string): string {
  return `${MSP_SECTION_HASH_PREFIX}${typeSectionId}`
}

export function parseMspSectionHash(hash: string): string | null {
  const value = hash.startsWith("#") ? hash.slice(1) : hash
  if (!value.startsWith(MSP_SECTION_HASH_PREFIX)) {
    return null
  }
  return value.slice(MSP_SECTION_HASH_PREFIX.length) || null
}

export function watchedChangeHref(payload: {
  document_id?: string
  node_id?: string
  type_section_id?: string
  in_portal?: boolean
  msp_id?: string
}): string | null {
  if (payload.type_section_id && payload.node_id) {
    return `/portal/folder/${payload.node_id}#${MSP_SECTION_HASH_PREFIX}${payload.type_section_id}`
  }
  if (payload.msp_id && payload.node_id) {
    return `/portal/folder/${payload.node_id}`
  }
  if (payload.document_id) {
    return `/document/${payload.document_id}`
  }
  if (payload.node_id) {
    return payload.in_portal
      ? `/portal/folder/${payload.node_id}`
      : `/folder/${payload.node_id}`
  }
  return null
}
