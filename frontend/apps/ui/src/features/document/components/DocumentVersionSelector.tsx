import {useAppDispatch} from "@/app/hooks"
import client from "@/httpClient"
import {useCurrentDocVer} from "@/features/document/hooks"
import {useGetDocLastVersionQuery, useGetDocVersionsListQuery} from "@/features/document/store/apiSlice"
import {addDocVersion} from "@/features/document/store/documentVersSlice"
import type {DocVersItem, DocumentVersion} from "@/features/document/types"
import {fileManager} from "@/features/files/fileManager"
import {currentDocVerUpdated} from "@/features/ui/uiSlice"
import {usePanelMode} from "@/hooks"
import {ActionIcon, Group, Menu, Text} from "@mantine/core"
import {IconCheck, IconHistory, IconLoader} from "@tabler/icons-react"
import {notifications} from "@mantine/notifications"
import {useMemo, useState} from "react"
import {useTranslation} from "react-i18next"

/**
 * Selects a document version to preview.
 *
 * The backend stores one row per version, but uploads of docx/images create
 * two rows (original + server-generated "X -> pdf" conversion). For the
 * user only "logical" versions matter - one per upload - so conversion
 * rows are filtered out of the list.
 */
export default function DocumentVersionSelector({docId}: {docId: string}) {
  const dispatch = useAppDispatch()
  const mode = usePanelMode()
  const {t} = useTranslation()
  const {docVer} = useCurrentDocVer()
  const {currentData: latestVer} = useGetDocLastVersionQuery(docId)
  const {data: versions} = useGetDocVersionsListQuery(docId)
  const [loadingId, setLoadingId] = useState<string>()

  const logicalVersions = useMemo(() => {
    const filtered = (versions ?? []).filter(
      v => !(v.short_description ?? "").includes("-> pdf")
    )
    return filtered
  }, [versions])

  if (logicalVersions.length < 2) {
    return null
  }

  const total = logicalVersions.length
  /** `logicalVersions` is sorted descending, so [0] is the latest upload. */
  const latestLogical = logicalVersions[0]
  const currentDocVerID = docVer?.id
  const viewingOutdated = Boolean(
    currentDocVerID && latestVer && currentDocVerID !== latestVer.id
  )
  const currentIdx = viewingOutdated
    ? logicalVersions.findIndex(v => v.id === currentDocVerID)
    : -1
  /**
   * 1-based version number counted from the oldest upload
   * (total = latest version).
   */
  const versionNumber = (idx: number) => total - idx

  const showLatest = () => {
    if (latestVer) {
      dispatch(currentDocVerUpdated({mode, docVerID: latestVer.id}))
    }
  }

  const showVersion = async (ver: DocVersItem) => {
    if (ver.id === latestLogical?.id) {
      showLatest()
      return
    }
    if (loadingId) {
      return
    }
    setLoadingId(ver.id)
    try {
      const resp = await client.get(`/api/document-versions/${ver.id}`)
      const v = resp.data as DocumentVersion
      dispatch(addDocVersion(v))
      dispatch(currentDocVerUpdated({mode, docVerID: v.id}))
      if (!v.download_url) {
        return
      }
      const blobResp = await client.get(v.download_url, {
        responseType: "blob"
      })
      const buffer = await blobResp.data.arrayBuffer()
      fileManager.store({buffer, docVerID: v.id})
    } catch (error) {
      console.error(`Failed to load document version ${ver.id}`, error)
      notifications.show({
        message: t("viewer.version.load_error"),
        color: "red"
      })
    } finally {
      setLoadingId(undefined)
    }
  }

  const buttonLabel = viewingOutdated && currentIdx >= 0
    ? t("viewer.version.label", {
        n: versionNumber(currentIdx),
        total
      })
    : t("viewer.versions")

  return (
    <Menu shadow="md" width={320}>
      <Menu.Target>
        <ActionIcon
          size="lg"
          variant="default"
          aria-label={buttonLabel}
        >
          <IconHistory size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          <Text size="sm" fw={600}>
            {t("viewer.versions.menu_title")}
          </Text>
        </Menu.Label>
        {logicalVersions.map((ver, idx) => {
            const isCurrent = viewingOutdated
              ? ver.id === currentDocVerID
              : ver.id === latestLogical?.id
            const isLoading = loadingId === ver.id
            return (
              <Menu.Item
                key={ver.id}
                onClick={() => showVersion(ver)}
                disabled={Boolean(loadingId)}
              >
                <Group justify="space-between" wrap="nowrap" gap="xs" style={{width: "100%"}}>
                  <Group wrap="nowrap" gap="xs" style={{flexShrink: 0}}>
                    {isLoading ? (
                      <IconLoader size={14} />
                    ) : isCurrent ? (
                      <IconCheck size={14} />
                    ) : (
                      <IconHistory size={14} />
                    )}
                    <Text size="sm" style={{whiteSpace: "nowrap"}}>
                      {t("viewer.version.label", {
                        n: versionNumber(idx),
                        total
                      })}
                      {idx === 0 ? ` · ${t("viewer.version.current")}` : ""}
                    </Text>
                  </Group>
                  <div
                    style={{
                      flex: "1 1 0",
                      minWidth: 0,
                      maxWidth: "100%",
                      overflow: "hidden",
                      textAlign: "right"
                    }}
                  >
                    <Text size="xs" c="dimmed" truncate style={{display: "block"}}>
                      {ver.file_name ?? ""}
                      {ver.page_count
                        ? ` · ${t("viewer.version.pages", {count: ver.page_count})}`
                        : ""}
                    </Text>
                  </div>
                </Group>
              </Menu.Item>
            )
          })}
      </Menu.Dropdown>
    </Menu>
  )
}
