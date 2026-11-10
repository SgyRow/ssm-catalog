import {useAppDispatch} from "@/app/hooks"
import client from "@/httpClient"
import {addDocVersion} from "@/features/document/store/documentVersSlice"
import type {DocumentVersion} from "@/features/document/types"
import {currentDocVerUpdated} from "@/features/ui/uiSlice"
import {usePanelMode} from "@/hooks"
import {ActionIcon, Tooltip} from "@mantine/core"
import axios from "axios"
import {IconUpload} from "@tabler/icons-react"
import {notifications} from "@mantine/notifications"
import {useRef, useState} from "react"
import {useTranslation} from "react-i18next"
import {apiSlice} from "@/features/api/slice"
import {formatApiErrorDetail} from "@/utils/apiError"

/**
 * Uploads a new file on top of an existing document (replaces the current
 * file while keeping all previous versions available in the version list).
 * The server creates a new document version and notifies users who have
 * the document on their watch list.
 */
export default function UploadNewVersionButton({docId}: {docId: string}) {
  const dispatch = useAppDispatch()
  const mode = usePanelMode()
  const {t} = useTranslation()
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const onFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    input.value = ""
    if (!file) {
      return
    }

    setUploading(true)
    const form = new FormData()
    form.append("file", file)
    try {
      const resp = await client.post(`/api/documents/${docId}/upload`, form, {
        headers: {"Content-Type": "multipart/form-data"}
      })
      const uploaded = resp.data as {
        versions?: Array<DocumentVersion>
      } | null
      const latest = (uploaded?.versions ?? [])
        .slice()
        .sort((a, b) => b.number - a.number)[0]
      if (latest) {
        dispatch(addDocVersion(latest))
        dispatch(currentDocVerUpdated({mode, docVerID: latest.id}))
      }
      notifications.show({message: t("viewer.upload_new_version.success")})
    } catch (error) {
      console.error("Failed to upload new document version", error)
      const detail = axios.isAxiosError(error)
        ? error.response?.data?.detail
        : undefined
      notifications.show({
        message:
          detail != null
            ? formatApiErrorDetail(detail)
            : t("viewer.upload_new_version.error"),
        color: "red"
      })
    } finally {
      setUploading(false)
      dispatch(
        apiSlice.util.invalidateTags([
          {type: "Document", id: docId},
          {type: "DocumentVersion", id: docId},
          {type: "DocVersList", id: docId},
          {type: "Node", id: docId}
        ])
      )
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={onFileSelected}
        accept="*/*"
      />
      <Tooltip label={t("viewer.upload_new_version.tooltip")} withArrow>
        <ActionIcon
          size="lg"
          variant="default"
          loading={uploading}
          onClick={() => inputRef.current?.click()}
          aria-label={t("viewer.upload_new_version.button")}
        >
          <IconUpload size={18} />
        </ActionIcon>
      </Tooltip>
    </>
  )
}
