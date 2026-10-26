import Cookies from "js-cookie"

import {
  ACCESSIBILITY_COOKIE_KEY,
  ACCESSIBILITY_STORAGE_KEY
} from "./constants"

export function readAccessibilityEnabled(): boolean {
  if (typeof window === "undefined") {
    return false
  }

  const stored = window.localStorage.getItem(ACCESSIBILITY_STORAGE_KEY)
  if (stored === "true") {
    return true
  }
  if (stored === "false") {
    return false
  }

  return Cookies.get(ACCESSIBILITY_COOKIE_KEY) === "true"
}

export function writeAccessibilityEnabled(enabled: boolean): void {
  window.localStorage.setItem(
    ACCESSIBILITY_STORAGE_KEY,
    enabled ? "true" : "false"
  )
  Cookies.set(ACCESSIBILITY_COOKIE_KEY, enabled ? "true" : "false")
}
