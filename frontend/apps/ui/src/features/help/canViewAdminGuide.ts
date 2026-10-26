import type {UserDetails} from "@/types"

const ADMIN_GUIDE_ROLE_NAMES = new Set(["admin", "moderator"])

/** Admin and moderator roles (and superusers) see the administrator guide tab. */
export function canViewAdminGuide(
  user: UserDetails | null | undefined
): boolean {
  if (!user) {
    return false
  }
  if (user.is_superuser) {
    return true
  }
  return (user.roles ?? []).some(role => ADMIN_GUIDE_ROLE_NAMES.has(role.name))
}
