/**
 * Best-effort RTF → plain text for in-browser preview (formatting is not preserved).
 */
export function rtfToPlainText(rtf: string): string {
  let text = rtf.replace(/\r\n/g, "\n")

  // Hex-encoded bytes (e.g. \'d0 for Cyrillic in cp1251 RTF).
  text = text.replace(/\\'([0-9a-f]{2})/gi, (_match, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  )

  // Common structural control words.
  text = text
    .replace(/\\par[d]?/gi, "\n")
    .replace(/\\line/gi, "\n")
    .replace(/\\tab/gi, "\t")

  // Drop remaining control words and symbols.
  text = text.replace(/\\[a-z]+-?\d* ?/gi, "")
  text = text.replace(/[{}]/g, "")

  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
