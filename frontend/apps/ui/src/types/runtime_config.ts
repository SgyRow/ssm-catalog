export type RuntimeConfig = {
  timezone?: string
  [key: string]: unknown
}

declare global {
  interface Window {
    __PAPERMERGE_RUNTIME_CONFIG__?: RuntimeConfig
  }
}
