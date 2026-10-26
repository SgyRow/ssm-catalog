import {useRouteError} from "react-router-dom"
import {useTranslation} from "react-i18next"

interface RouteError {
  data: string
  error: {
    columnNumber: number
    fileName: string
    lineNumber: number
    message: string
    stack: string
  }
  internal: boolean
  status: number
  statusText: string
}

export default function PageNotFound() {
  const {t} = useTranslation()
  const error = useRouteError() as RouteError
  console.error(error)

  return (
    <div id="error-page">
      <h1>{t("pages.error.unexpected.title")}</h1>
      <p>{t("pages.error.unexpected.message")}</p>
    </div>
  )
}
