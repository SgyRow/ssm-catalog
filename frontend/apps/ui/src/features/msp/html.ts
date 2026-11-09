const TAG_RE = /<[^>]+>/g
const ENTITY_RE = /&nbsp;|&#160;|&#xA0;/gi
const HTML_RE = /<\/?[a-z][\s\S]*>/i

export function looksLikeHtml(value: string): boolean {
  return HTML_RE.test(value || "")
}

export function plainText(value: string): string {
  return (value || "")
    .replace(ENTITY_RE, " ")
    .replace(TAG_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function isEmptyMspBody(value: string | null | undefined): boolean {
  return !plainText(value || "")
}
