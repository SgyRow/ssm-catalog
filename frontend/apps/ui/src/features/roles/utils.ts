import type {TFunction} from "i18next"

const SCOPE_TO_SKIP = [
  "folder",
  "document",
  "tag",
  "portal",
  "user",
  "role",
  "group",
  "document.page",
  "comment"
]

const FOLDER_DOCUMENT_NODE_MAP: Record<string, string> = {
  "folder.view": "node.view",
  "folder.create": "node.create",
  "folder.update": "node.update",
  "folder.move": "node.move",
  "folder.delete": "node.delete",
  "document.view": "node.view",
  "document.update": "node.update",
  "document.move": "node.move",
  "document.delete": "node.delete"
}

/** Fine-grained document field scopes stored as-is on the server. */
const DOCUMENT_FIELD_SCOPES = new Set([
  "document.update.title",
  "document.update.tags",
  "document.full_version.view",
  "document.full_version.manage"
])

const PAGE_MANAGEMENT_MAP_C2S: Record<string, string> = {
  "document.page.extract": "page.extract",
  "document.page.move": "page.move",
  "document.page.rotate": "page.rotate",
  "document.page.reorder": "page.reorder",
  "document.page.delete": "page.delete"
}

/** Rotate/reorder/delete are enforced via page.update on the API. */
const PAGE_OPS_TO_UPDATE: Record<string, string> = {
  "page.reorder": "page.update",
  "page.rotate": "page.update",
  "page.delete": "page.update"
}

const DOWNLOAD_CHILD_SCOPES = new Set([
  "document.download.all_versions",
  "document.download.last_version_only"
])

function mapClientScopeToServer(scope: string): string[] {
  if (SCOPE_TO_SKIP.includes(scope)) {
    return []
  }
  if (scope in FOLDER_DOCUMENT_NODE_MAP) {
    return [FOLDER_DOCUMENT_NODE_MAP[scope]]
  }
  if (DOCUMENT_FIELD_SCOPES.has(scope)) {
    return [scope]
  }
  if (scope in PAGE_MANAGEMENT_MAP_C2S) {
    const server = PAGE_MANAGEMENT_MAP_C2S[scope]
    const implied = PAGE_OPS_TO_UPDATE[server]
    return implied ? [server, implied] : [server]
  }
  if (scope in PAGE_OPS_TO_UPDATE) {
    return [scope, PAGE_OPS_TO_UPDATE[scope]]
  }
  if (DOWNLOAD_CHILD_SCOPES.has(scope)) {
    return [scope, "document.download"]
  }
  return [scope]
}

function client2serverPerms(scopes: string[]): string[] {
  const result = new Set<string>()

  scopes.forEach(scope => {
    mapClientScopeToServer(scope).forEach(s => result.add(s))
  })

  // Every authenticated user needs profile/notifications access.
  result.add("user.me")

  return [...result].sort()
}

const NODE_FOLDER_DOCUMENT_MAP: Record<string, string[]> = {
  "node.view": ["folder.view", "document.view"],
  "node.create": ["folder.create"],
  "node.update": ["folder.update", "document.update.title"],
  "node.delete": ["folder.delete", "document.delete"],
  "node.move": ["folder.move", "document.move"]
}

const PAGE_MANAGEMENT_MAP_S2C: Record<string, string> = {
  "page.extract": "document.page.extract",
  "page.move": "document.page.move",
  "page.rotate": "document.page.rotate",
  "page.reorder": "document.page.reorder",
  "page.delete": "document.page.delete"
}

function server2clientPerms(scopes: string[]): string[] {
  const result: string[] = []

  scopes.forEach(scope => {
    if (scope in NODE_FOLDER_DOCUMENT_MAP) {
      result.push(...NODE_FOLDER_DOCUMENT_MAP[scope])
    } else if (scope in PAGE_MANAGEMENT_MAP_S2C) {
      result.push(PAGE_MANAGEMENT_MAP_S2C[scope])
    } else {
      result.push(scope)
    }
  })

  return result
}

export function formatBuiltinRoleName(name: string, t: TFunction): string {
  const key = `roles.builtin.${name}`
  const translated = t(key)
  return translated === key ? name : translated
}

export {client2serverPerms, server2clientPerms}
