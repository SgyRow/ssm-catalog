import i18n from "i18next"

type AttrError = {
  name: string
  message: string
}

type ApiErrorBody = {
  attrs?: AttrError[] | null
  messages?: string[] | null
}

/** Known backend error messages mapped to i18n keys. */
const MESSAGE_I18N: Record<string, string> = {
  "Within a folder title must be unique": "upload.error.duplicate_title"
}

function localizeMessage(message: string): string {
  const key = MESSAGE_I18N[message]
  return key ? i18n.t(key) : message
}

/** Turn a FastAPI `detail` field into a user-facing localized string. */
export function formatApiErrorDetail(detail: unknown): string {
  if (detail == null) {
    return i18n.t("upload.error.generic")
  }

  if (typeof detail === "string") {
    return localizeMessage(detail)
  }

  if (typeof detail === "object") {
    const body = detail as ApiErrorBody
    const parts: string[] = []

    for (const attr of body.attrs ?? []) {
      parts.push(localizeMessage(attr.message))
    }

    for (const message of body.messages ?? []) {
      parts.push(localizeMessage(message))
    }

    if (parts.length > 0) {
      return parts.join(". ")
    }
  }

  return i18n.t("upload.error.generic")
}
