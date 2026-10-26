export const NODE_CREATE = "node.create"
export const NODE_VIEW = "node.view"
export const NODE_UPDATE = "node.update"
export const NODE_DELETE = "node.delete"
export const NODE_MOVE = "node.move"
export const COMMANDER_VIEW = "commander.view"
export const PORTAL_VIEW = "portal.view"
export const PORTAL_FEED_VIEW = "portal.feed.view"
export const PORTAL_FEED_MANAGE = "portal.feed.manage"
export const PORTAL_SECTION_CREATE = "portal.section.create"
export const PORTAL_SECTION_UPDATE = "portal.section.update"
export const PORTAL_SECTION_DELETE = "portal.section.delete"
export const PORTAL_DOCUMENT_UPLOAD = "portal.document.upload"
export const PORTAL_DOCUMENT_UPDATE = "portal.document.update"
export const PORTAL_DOCUMENT_DELETE = "portal.document.delete"
export const CITIZEN_CATEGORY_VIEW = "citizen_category.view"
export const CITIZEN_CATEGORY_CREATE = "citizen_category.create"
export const CITIZEN_CATEGORY_UPDATE = "citizen_category.update"
export const CITIZEN_CATEGORY_DELETE = "citizen_category.delete"
export const COMMENT_CREATE = "comment.create"
export const COMMENT_UPDATE = "comment.update"
export const COMMENT_DELETE = "comment.delete"
export const DOCUMENT_UPDATE_TAGS = "document.update.tags"
export const DOCUMENT_FULL_VERSION_VIEW = "document.full_version.view"
export const DOCUMENT_FULL_VERSION_MANAGE = "document.full_version.manage"
export const DOCUMENT_UPLOAD = "document.upload"
export const DOCUMENT_DOWNLOAD = "document.download"
export const TAG_CREATE = "tag.create"
export const TAG_VIEW = "tag.view"
export const TAG_SELECT = "tag.select"
export const TAG_UPDATE = "tag.update"
export const TAG_DELETE = "tag.delete"
export const USER_CREATE = "user.create"
export const USER_VIEW = "user.view"
export const USER_UPDATE = "user.update"
export const USER_DELETE = "user.delete"
export const USER_ME = "user.me"
export const USER_SELECT = "user.select"
export const GROUP_CREATE = "group.create"
export const GROUP_VIEW = "group.view"
export const GROUP_SELECT = "group.select"
export const GROUP_UPDATE = "group.update"
export const GROUP_DELETE = "group.delete"
export const ROLE_CREATE = "role.create"
export const ROLE_VIEW = "role.view"
export const ROLE_SELECT = "role.select"
export const ROLE_UPDATE = "role.update"
export const ROLE_DELETE = "role.delete"
export const TASK_OCR = "task.ocr"
export const OCRLANG_VIEW = "ocrlang.view"
export const PAGE_VIEW = "page.view"
export const PAGE_UPDATE = "page.update"
export const PAGE_MOVE = "page.move"
export const PAGE_EXTRACT = "page.extract"
export const PAGE_DELETE = "page.delete"

/** Tag admin: create / update / delete on /tags (moderator & admin by default). */
export function canManageTags(scopes: string[]): boolean {
  return (
    scopes.includes(TAG_CREATE) ||
    scopes.includes(TAG_UPDATE) ||
    scopes.includes(TAG_DELETE)
  )
}

/** Assign tags on documents/folders (``document.update.tags`` or full ``node.update``). */
export function canUpdateNodeTags(scopes: string[]): boolean {
  return scopes.includes(NODE_UPDATE) || scopes.includes(DOCUMENT_UPDATE_TAGS)
}

/** Pick existing tags from the catalog and assign them to a node. */
export function canAssignNodeTags(scopes: string[]): boolean {
  return scopes.includes(TAG_SELECT) || canUpdateNodeTags(scopes)
}

/** Pick tags from the organization catalog when editing a node. */
export function canSelectTags(scopes: string[]): boolean {
  return scopes.includes(TAG_SELECT) || canUpdateNodeTags(scopes)
}

export type CommanderWriteContext = {
  /** Folder is under the legal portal catalog and route is ``/folder/…``. */
  isPortalContext: boolean
}

/** Open the file manager UI (``/folder/…``). */
export function canOpenCommander(scopes: string[]): boolean {
  return scopes.includes(COMMANDER_VIEW)
}

export function canUploadInCommander(
  scopes: string[],
  ctx: CommanderWriteContext
): boolean {
  if (ctx.isPortalContext) {
    return scopes.includes(PORTAL_DOCUMENT_UPLOAD)
  }
  return scopes.includes(DOCUMENT_UPLOAD)
}

export function canCreateFolderInCommander(
  scopes: string[],
  ctx: CommanderWriteContext
): boolean {
  if (ctx.isPortalContext) {
    return scopes.includes(PORTAL_SECTION_CREATE)
  }
  return scopes.includes(NODE_CREATE)
}

export function canDeleteInCommander(
  scopes: string[],
  ctx: CommanderWriteContext
): boolean {
  if (ctx.isPortalContext) {
    return (
      scopes.includes(PORTAL_SECTION_DELETE) ||
      scopes.includes(PORTAL_DOCUMENT_DELETE)
    )
  }
  return scopes.includes(NODE_DELETE)
}

export function canRenameInCommander(
  scopes: string[],
  ctx: CommanderWriteContext
): boolean {
  if (ctx.isPortalContext) {
    return (
      scopes.includes(PORTAL_SECTION_UPDATE) ||
      scopes.includes(PORTAL_DOCUMENT_UPDATE)
    )
  }
  return scopes.includes(NODE_UPDATE)
}

export function canReorderInCommander(
  scopes: string[],
  ctx: CommanderWriteContext
): boolean {
  return canRenameInCommander(scopes, ctx)
}

export function canMoveInCommander(
  scopes: string[],
  ctx: CommanderWriteContext
): boolean {
  if (ctx.isPortalContext) {
    return (
      scopes.includes(PORTAL_SECTION_UPDATE) ||
      scopes.includes(PORTAL_DOCUMENT_UPDATE)
    )
  }
  return scopes.includes(NODE_MOVE)
}

export function canUseMspTemplateInCommander(scopes: string[]): boolean {
  return scopes.includes(NODE_CREATE)
}

export function canMutateInCommander(
  scopes: string[],
  ctx: CommanderWriteContext
): boolean {
  return (
    canUploadInCommander(scopes, ctx) ||
    canCreateFolderInCommander(scopes, ctx) ||
    canDeleteInCommander(scopes, ctx) ||
    canRenameInCommander(scopes, ctx) ||
    canMoveInCommander(scopes, ctx)
  )
}

export const ALL_PERMS = [
  DOCUMENT_DOWNLOAD,
  DOCUMENT_UPLOAD,
  PAGE_VIEW,
  PAGE_MOVE,
  PAGE_UPDATE,
  PAGE_DELETE,
  PAGE_EXTRACT,
  USER_VIEW,
  USER_CREATE,
  USER_UPDATE,
  USER_DELETE,
  USER_ME,
  GROUP_VIEW,
  GROUP_CREATE,
  GROUP_UPDATE,
  GROUP_DELETE,
  ROLE_VIEW,
  ROLE_CREATE,
  ROLE_UPDATE,
  ROLE_DELETE,
  TAG_VIEW,
  TAG_SELECT,
  TAG_CREATE,
  TAG_UPDATE,
  TAG_DELETE,
  NODE_VIEW,
  COMMANDER_VIEW,
  NODE_MOVE,
  NODE_CREATE,
  NODE_UPDATE,
  DOCUMENT_UPDATE_TAGS,
  DOCUMENT_FULL_VERSION_VIEW,
  DOCUMENT_FULL_VERSION_MANAGE,
  NODE_DELETE,
  COMMENT_CREATE,
  COMMENT_UPDATE,
  COMMENT_DELETE,
  TASK_OCR,
  OCRLANG_VIEW,
  PORTAL_VIEW,
  PORTAL_FEED_VIEW,
  PORTAL_FEED_MANAGE,
  PORTAL_SECTION_CREATE,
  PORTAL_SECTION_UPDATE,
  PORTAL_SECTION_DELETE,
  PORTAL_DOCUMENT_UPLOAD,
  PORTAL_DOCUMENT_UPDATE,
  PORTAL_DOCUMENT_DELETE,
  CITIZEN_CATEGORY_VIEW,
  CITIZEN_CATEGORY_CREATE,
  CITIZEN_CATEGORY_UPDATE,
  CITIZEN_CATEGORY_DELETE
]
