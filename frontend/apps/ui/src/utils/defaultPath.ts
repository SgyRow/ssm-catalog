import {
  NODE_VIEW,
  PORTAL_FEED_VIEW,
  PORTAL_VIEW,
  canManageTags
} from "@/scopes"

/** First screen after login — portal home when the user may browse the catalog. */
export function resolveDefaultPath(scopes: string[]): string {
  if (scopes.includes(PORTAL_VIEW)) {
    return "/portal"
  }
  if (scopes.includes(NODE_VIEW)) {
    return "/library/favorites"
  }
  if (scopes.includes(PORTAL_FEED_VIEW)) {
    return "/portal/feed"
  }
  if (canManageTags(scopes)) {
    return "/tags"
  }
  return "/portal"
}
