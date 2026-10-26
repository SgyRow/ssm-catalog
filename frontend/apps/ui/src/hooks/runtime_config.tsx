import {RuntimeConfig} from "@/types/runtime_config"
import {useEffect, useState} from "react"

const RUNTIME_CONFIG_DEFAULT: RuntimeConfig = {}

export function useRuntimeConfig(): RuntimeConfig {
  const [config, setConfig] = useState<RuntimeConfig>(RUNTIME_CONFIG_DEFAULT)

  useEffect(() => {
    if (window.hasOwnProperty("__PAPERMERGE_RUNTIME_CONFIG__")) {
      setConfig(window.__PAPERMERGE_RUNTIME_CONFIG__)
    }
  }, [JSON.stringify(window.__PAPERMERGE_RUNTIME_CONFIG__)])

  return config
}
