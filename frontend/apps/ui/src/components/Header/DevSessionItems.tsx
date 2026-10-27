import {persistDevUsername} from "@/features/auth/devSession"
import axios from "@/httpClient"
import {Menu, Stack, Text} from "@mantine/core"
import {IconCheck} from "@tabler/icons-react"
import {useEffect, useState} from "react"
import {useTranslation} from "react-i18next"

type DevSessionUser = {
  username: string
  label: string
  is_superuser: boolean
  roles: string[]
}

type DevSessionState = {
  enabled: boolean
  username: string
  users: DevSessionUser[]
}

function roleHint(
  user: DevSessionUser,
  t: (key: string) => string
): string {
  if (user.is_superuser) {
    return t("extra.dev_session_admin")
  }
  if (user.roles.length === 0 || (user.roles.length === 1 && user.roles[0] === "employee")) {
    return t("extra.dev_session_employee")
  }
  return user.roles.join(", ")
}

/**
 * Native-dev only. Lists active accounts so the header can leave the
 * superuser session and open a regular employee with role scopes only.
 */
export default function DevSessionItems() {
  const {t} = useTranslation()
  const [session, setSession] = useState<DevSessionState | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    axios
      .get<DevSessionState>("/api/dev/session")
      .then(response => {
        if (!cancelled) {
          setSession(response.data)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!session?.enabled || session.users.length < 2) {
    return null
  }

  const onPick = async (username: string) => {
    if (username === session.username || pending) {
      return
    }
    setPending(username)
    try {
      await axios.post("/api/dev/session", {username})
      persistDevUsername(username)
      window.location.reload()
    } catch {
      setPending(null)
    }
  }

  return (
    <>
      <Menu.Label>{t("extra.dev_session")}</Menu.Label>
      {session.users.map(user => (
        <Menu.Item
          key={user.username}
          disabled={pending !== null}
          leftSection={
            user.username === session.username ? (
              <IconCheck size={14} />
            ) : (
              <span style={{width: 14}} />
            )
          }
          onClick={() => {
            void onPick(user.username)
          }}
        >
          <Stack gap={0}>
            <Text size="sm">{user.label}</Text>
            <Text size="xs" c="dimmed">
              {roleHint(user, t)}
              {user.label !== user.username ? ` · ${user.username}` : ""}
            </Text>
          </Stack>
        </Menu.Item>
      ))}
      <Menu.Divider />
    </>
  )
}
