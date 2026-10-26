import {LoaderFunctionArgs} from "react-router"
import {useSelector} from "react-redux"
import {Navigate} from "react-router-dom"

import DualPanel from "@/components/DualPanel"
import {ERRORS_403_ACCESS_FORBIDDEN} from "@/cconstants"
import {currentNodeChanged} from "@/features/ui/uiSlice"
import {canOpenCommander} from "@/scopes"
import {selectCurrentUser, selectCurrentUserStatus} from "@/slices/currentUser"

import {store} from "@/app/store"

export default function Folder() {
  const status = useSelector(selectCurrentUserStatus)
  const user = useSelector(selectCurrentUser)
  const scopes = user?.scopes ?? []

  if (status === "succeeded" && user && !canOpenCommander(scopes)) {
    return <Navigate to={ERRORS_403_ACCESS_FORBIDDEN} replace />
  }

  return <DualPanel />
}

export async function loader({params, request}: LoaderFunctionArgs) {
  const url = new URL(request.url)
  const folderId = params.folderId
  if (!folderId) {
    throw new Response("Missing folder id", {status: 400})
  }

  store.dispatch(
    currentNodeChanged({id: folderId, ctype: "folder", panel: "main"})
  )

  return {nodeId: folderId, urlParams: url.searchParams}
}
