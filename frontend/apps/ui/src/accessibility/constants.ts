export const ACCESSIBILITY_STORAGE_KEY = "papermerge-accessibility-enabled"
export const ACCESSIBILITY_COOKIE_KEY = "accessibility_mode"

/** AppShell header height in pixels (must match App.tsx). */
export const HEADER_HEIGHT_DEFAULT = 60
export const HEADER_HEIGHT_ACCESSIBILITY = 80

/** WCAG AAA target: 7:1 contrast — black on white / white on black. */
export const A11Y_LIGHT = {
  body: "#ffffff",
  text: "#000000",
  link: "#0000cc",
  border: "#000000",
  focus: "#0000ff"
} as const

export const A11Y_DARK = {
  body: "#000000",
  text: "#ffffff",
  link: "#ffff00",
  border: "#ffffff",
  focus: "#ffff00"
} as const
