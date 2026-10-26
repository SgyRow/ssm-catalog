/** Decode JSON audit details and render Unicode characters readably. */
export function formatAuditDetail(detail: string | null | undefined): string {
  if (detail == null || detail === "") {
    return "—"
  }

  const trimmed = detail.trim()
  const looksLikeJson =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))

  if (!looksLikeJson) {
    return detail
  }

  try {
    return JSON.stringify(JSON.parse(trimmed))
  } catch {
    return detail
  }
}
