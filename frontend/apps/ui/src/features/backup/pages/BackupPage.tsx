import {
  Alert,
  Button,
  Card,
  FileInput,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  Title
} from "@mantine/core"
import {IconAlertTriangle, IconDatabaseExport, IconDatabaseImport} from "@tabler/icons-react"
import Cookies from "js-cookie"
import {useState} from "react"
import {useSelector} from "react-redux"
import {useTranslation} from "react-i18next"

import {getBaseURL} from "@/utils"
import {selectCurrentUser} from "@/slices/currentUser"
import type {UserDetails} from "@/types"
import AccessForbidden from "@/pages/errors/AccessForbidden"

const BACKUP_FILENAME = "papermerge-backup.pmgbackup"

type SaveFilePicker = (options: {
  suggestedName?: string
}) => Promise<{
  createWritable: () => Promise<WritableStream & {abort: () => Promise<void>}>
}>

function authHeaders(): Record<string, string> {
  const token = Cookies.get("access_token")
  return token ? {Authorization: `Bearer ${token}`} : {}
}

async function readError(response: Response, fallback: string): Promise<string> {
  const text = await response.text()
  try {
    const data = JSON.parse(text) as {detail?: unknown}
    if (typeof data.detail === "string" && data.detail.trim()) {
      return data.detail
    }
  } catch {
    // Response is not JSON.
  }
  return text.trim() || fallback
}

function restoreFailureText(
  status: number,
  body: string,
  tooLarge: string,
  fallback: string
): string {
  if (status === 413) {
    return tooLarge
  }
  const trimmed = body.trim()
  if (!trimmed || trimmed.startsWith("<")) {
    return fallback
  }
  try {
    const data = JSON.parse(trimmed) as {detail?: unknown}
    if (typeof data.detail === "string" && data.detail.trim()) {
      return data.detail
    }
  } catch {
    // Plain text from the server.
  }
  return trimmed
}

export default function BackupPage() {
  const {t} = useTranslation()
  const user = useSelector(selectCurrentUser) as UserDetails | null
  const [file, setFile] = useState<File | null>(null)
  const [restoreOpened, setRestoreOpened] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  if (!user) return <Loader />
  if (!user.is_superuser) return <AccessForbidden />

  const exportBackup = async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    const url = `${getBaseURL()}/api/admin/backup/export`
    try {
      const picker = (
        window as Window & {showSaveFilePicker?: SaveFilePicker}
      ).showSaveFilePicker
      if (typeof picker === "function") {
        let handle: Awaited<ReturnType<SaveFilePicker>>
        try {
          handle = await picker({suggestedName: BACKUP_FILENAME})
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") {
            return
          }
          throw e
        }
        const writable = await handle.createWritable()
        try {
          const response = await fetch(url, {
            headers: authHeaders(),
            credentials: "include"
          })
          if (!response.ok || !response.body) {
            throw new Error(await readError(response, t("backup.error")))
          }
          await response.body.pipeTo(writable)
          setNotice(t("backup.export_done"))
        } catch (e) {
          await writable.abort().catch(() => undefined)
          throw e
        }
        return
      }

      const probe = await fetch(`${url}?probe=1`, {
        headers: authHeaders(),
        credentials: "include"
      })
      if (!probe.ok) {
        throw new Error(await readError(probe, t("backup.error")))
      }
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = BACKUP_FILENAME
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setNotice(t("backup.export_started"))
    } catch (e) {
      setError(e instanceof Error ? e.message : t("backup.error"))
    } finally {
      setBusy(false)
    }
  }

  const importBackup = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    setNotice(null)
    setSuccess(false)
    try {
      const formData = new FormData()
      formData.append("backup", file)
      const response = await fetch(`${getBaseURL()}/api/admin/backup/import`, {
        method: "POST",
        headers: authHeaders(),
        body: formData
      })
      if (!response.ok) {
        const body = await response.text()
        throw new Error(
          restoreFailureText(
            response.status,
            body,
            t("backup.restore_too_large"),
            t("backup.restore_error")
          )
        )
      }
      setSuccess(true)
      setRestoreOpened(false)
      setFile(null)
      window.setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      const offline =
        e instanceof TypeError ||
        (e instanceof Error && /failed to fetch|networkerror|connection/i.test(e.message))
      setError(offline ? t("backup.restore_network_error") : e instanceof Error ? e.message : t("backup.restore_error"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack p="md" gap="lg">
      <Title order={2}>{t("backup.title")}</Title>
      <Text c="dimmed">{t("backup.description")}</Text>

      {error ? <Alert color="red">{error}</Alert> : null}
      {notice ? <Alert color="blue">{notice}</Alert> : null}
      {success ? <Alert color="green">{t("backup.restore_success")}</Alert> : null}

      <Card withBorder padding="lg">
        <Stack gap="md">
          <Group wrap="nowrap" align="flex-start">
            <IconDatabaseExport size={28} />
            <div>
              <Text fw={600}>{t("backup.export_title")}</Text>
              <Text size="sm" c="dimmed">{t("backup.export_description")}</Text>
            </div>
          </Group>
          <Button
            leftSection={<IconDatabaseExport size={18} />}
            onClick={() => void exportBackup()}
            loading={busy}
          >
            {t("backup.export_button")}
          </Button>
          {busy ? (
            <Text size="sm" c="dimmed">
              {t("backup.export_busy")}
            </Text>
          ) : null}
        </Stack>
      </Card>

      <Card withBorder padding="lg">
        <Stack gap="md">
          <Group wrap="nowrap" align="flex-start">
            <IconDatabaseImport size={28} />
            <div>
              <Text fw={600}>{t("backup.import_title")}</Text>
              <Text size="sm" c="dimmed">{t("backup.import_description")}</Text>
            </div>
          </Group>
          <FileInput
            value={file}
            onChange={setFile}
            accept=".pmgbackup,.tar.gz,.tgz"
            placeholder={t("backup.file_placeholder")}
            clearable
          />
          <Button
            leftSection={<IconDatabaseImport size={18} />}
            disabled={!file}
            onClick={() => setRestoreOpened(true)}
            color="red"
          >
            {t("backup.import_button")}
          </Button>
        </Stack>
      </Card>

      <Alert icon={<IconAlertTriangle size={18} />} color="orange" title={t("backup.warning_title")}>
        {t("backup.warning")}
      </Alert>

      <Modal
        opened={restoreOpened}
        onClose={() => !busy && setRestoreOpened(false)}
        title={t("backup.confirm_title")}
        centered
      >
        <Stack>
          <Text>{t("backup.confirm_text")}</Text>
          {error ? <Alert color="red">{error}</Alert> : null}
          {busy ? (
            <Text size="sm" c="dimmed">
              {t("backup.restore_busy")}
            </Text>
          ) : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRestoreOpened(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button color="red" onClick={importBackup} loading={busy}>
              {t("backup.confirm_button")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
