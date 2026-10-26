import {MantineProvider, createTheme, mergeMantineTheme} from "@mantine/core"
import type {MantineTheme} from "@mantine/core"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode
} from "react"

import baseTheme from "@/themes"

import {accessibilityThemeOverrides} from "./accessibilityTheme"

import "./accessibility.css"

type AccessibilityContextValue = {
  enabled: boolean
  toggle: () => void
  setEnabled: (value: boolean) => void
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(
  null
)

function applyDocumentAccessibilityFlag(enabled: boolean): void {
  document.documentElement.setAttribute(
    "data-accessibility",
    enabled ? "true" : "false"
  )
}

type AccessibilityProviderProps = {
  children: ReactNode
}

export function AccessibilityProvider({children}: AccessibilityProviderProps) {
  // Temporarily forced off — toggle UI removed until the feature is finished.
  const enabled = false

  const setEnabled = useCallback((_value: boolean) => {}, [])

  const toggle = useCallback(() => {}, [])

  useEffect(() => {
    applyDocumentAccessibilityFlag(false)
  }, [])

  const theme = useMemo(() => {
    if (!enabled) {
      return baseTheme
    }
    return mergeMantineTheme(
      baseTheme as MantineTheme,
      createTheme(accessibilityThemeOverrides)
    )
  }, [enabled])

  const value = useMemo(
    () => ({
      enabled,
      toggle,
      setEnabled
    }),
    [enabled, toggle, setEnabled]
  )

  return (
    <AccessibilityContext.Provider value={value}>
      <MantineProvider theme={theme}>{children}</MantineProvider>
    </AccessibilityContext.Provider>
  )
}

export function useAccessibility(): AccessibilityContextValue {
  const ctx = useContext(AccessibilityContext)
  if (!ctx) {
    throw new Error("useAccessibility must be used within AccessibilityProvider")
  }
  return ctx
}
