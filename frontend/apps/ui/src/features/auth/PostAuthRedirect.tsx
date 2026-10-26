import {Loader, Center} from "@mantine/core"
import {useEffect, useRef, useState} from "react"
import {useDispatch, useSelector} from "react-redux"
import {Navigate} from "react-router-dom"

import {
  clearAuthCookie,
  navigateToLogin,
  recordAuthSessionEvent,
  usesNginxAuthGate
} from "@/features/public/guestMode"
import {
  fetchCurrentUser,
  selectCurrentUser,
  selectCurrentUserStatus
} from "@/slices/currentUser"
import {resolveDefaultPath} from "@/utils/defaultPath"

const RETRY_DELAY_MS = 400

/**
 * Used after auth-server login (/home). Waits for /api/users/me, then routes
 * to the role-appropriate landing page.
 */
export default function PostAuthRedirect() {
  const dispatch = useDispatch()
  const status = useSelector(selectCurrentUserStatus)
  const user = useSelector(selectCurrentUser)
  const retried = useRef(false)
  const authHandoffStarted = useRef(false)
  const loginAuditSent = useRef(false)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    dispatch(fetchCurrentUser())
  }, [dispatch])

  useEffect(() => {
    if (status !== "failed" || retried.current) {
      return
    }
    retried.current = true
    setRetrying(true)
    const timer = window.setTimeout(() => {
      dispatch(fetchCurrentUser())
    }, RETRY_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [dispatch, status])

  useEffect(() => {
    if (status === "loading" || status === "succeeded") {
      setRetrying(false)
    }
  }, [status])

  useEffect(() => {
    if (status !== "succeeded" || !user || loginAuditSent.current) {
      return
    }
    loginAuditSent.current = true
    void recordAuthSessionEvent("login")
  }, [status, user])

  useEffect(() => {
    if (status !== "failed" || retrying || authHandoffStarted.current) {
      return
    }
    authHandoffStarted.current = true
    if (usesNginxAuthGate()) {
      clearAuthCookie()
      // Full reload so nginx serves auth-server login (not this UI route).
      window.location.replace("/login")
      return
    }
    navigateToLogin()
  }, [status, retrying])

  if (status === "idle" || status === "loading" || retrying) {
    return (
      <Center mih="50vh">
        <Loader />
      </Center>
    )
  }

  if (status === "failed" || !user) {
    return (
      <Center mih="50vh">
        <Loader />
      </Center>
    )
  }

  return <Navigate to={resolveDefaultPath(user.scopes ?? [])} replace />
}
