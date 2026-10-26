import Cookies from "js-cookie"

const ACCESS_TOKEN_COOKIE = "access_token"

export function hasAuthCookie(): boolean {
  return document.cookie
    .split(";")
    .some(c => c.trim().startsWith(`${ACCESS_TOKEN_COOKIE}=`))
}

/** Remove the JWT cookie from all paths the auth-server may have used. */
export function clearAuthCookie(): void {
  for (const path of ["/", "/home", ""]) {
    Cookies.remove(ACCESS_TOKEN_COOKIE, {path: path || undefined})
  }
  document.cookie = `${ACCESS_TOKEN_COOKIE}=; Max-Age=0; path=/`
  document.cookie = `${ACCESS_TOKEN_COOKIE}=; Max-Age=0; path=/home`
}

/** Best-effort audit record for login/logout (does not block navigation). */
export async function recordAuthSessionEvent(
  event: "login" | "logout"
): Promise<void> {
  try {
    const base = import.meta.env.VITE_BASE_URL || window.location.origin
    await fetch(`${base}/api/library/audit/session/`, {
      method: "POST",
      credentials: "include",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({event})
    })
  } catch {
    // ignore — session transition must not depend on audit
  }
}

/**
 * True when API calls use same-origin relative URLs and nginx auth_request
 * gates protected routes (docker/production bundle).
 */
export function usesNginxAuthGate(): boolean {
  const viteBase = import.meta.env.VITE_BASE_URL as string | undefined
  return !viteBase || viteBase === window.location.origin
}

/**
 * Open the auth-server login page. Clears any stale client cookie first so
 * nginx auth_request returns 401 and serves the login SPA.
 */
export function navigateToLogin(): void {
  clearAuthCookie()
  window.location.replace("/login")
}

/** End the session and open the login page (full page navigation). */
export function navigateToLogout(): void {
  void recordAuthSessionEvent("logout").finally(() => {
    clearAuthCookie()
    window.location.replace("/login")
  })
}

/** Routes where PostAuthRedirect owns the /api/users/me fetch after login. */
export function isPostAuthRoute(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/home") {
    return true
  }
  return pathname.startsWith("/login/") || pathname.startsWith("/home/")
}
