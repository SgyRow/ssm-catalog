/** App display zone: UTC+10 (Khabarovsk / Vladivostok). No DST. */
export const APP_TIMEZONE = "Asia/Vladivostok"

function resolveAppTimezone(): string {
  const fromRuntime = window.__PAPERMERGE_RUNTIME_CONFIG__?.timezone
  return typeof fromRuntime === "string" && fromRuntime.trim()
    ? fromRuntime.trim()
    : APP_TIMEZONE
}

/**
 * API datetimes are UTC. Naive ISO strings lack a zone suffix — treat as UTC.
 * Aware values (…Z or ±HH:MM) are parsed as-is.
 */
export function parseApiDateTime(value: string | Date): Date {
  if (value instanceof Date) {
    return value
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return new Date(NaN)
  }
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(trimmed)
  }
  return new Date(`${trimmed}Z`)
}

/** Format an API datetime for the UI — always Asia/Vladivostok (UTC+10). */
export function formatApiDateTime(value: string | Date): string {
  const date = parseApiDateTime(value)
  if (Number.isNaN(date.getTime())) {
    return ""
  }
  return date.toLocaleString("ru-RU", {
    timeZone: resolveAppTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  })
}
