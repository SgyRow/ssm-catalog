import Cookies from "js-cookie"

/** Native auth-bypass identity. Ignored by the API when bypass is off. */
export const DEV_USER_STORAGE_KEY = "pm_dev_user"
export const DEV_USER_COOKIE = "pm_dev_user"
export const DEV_USER_HEADER = "X-PM-Dev-User"
export const DEV_USER_QUERY = "dev_user"

export function readDevUsername(): string | null {
  try {
    const value = localStorage.getItem(DEV_USER_STORAGE_KEY)?.trim()
    return value || null
  } catch {
    return null
  }
}

export function persistDevUsername(username: string) {
  localStorage.setItem(DEV_USER_STORAGE_KEY, username)
  Cookies.set(DEV_USER_COOKIE, username, {path: "/"})
}

export function appendDevUserQuery(url: string): string {
  const username = readDevUsername()
  if (!username) {
    return url
  }
  const sep = url.includes("?") ? "&" : "?"
  return `${url}${sep}${DEV_USER_QUERY}=${encodeURIComponent(username)}`
}
