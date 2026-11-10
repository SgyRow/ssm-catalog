import {
  useAddLibraryWatchedMutation,
  useGetLibraryWatchedQuery,
  useRemoveLibraryWatchedMutation
} from "@/features/library/libraryApiSlice"
import {ActionIcon, Tooltip} from "@mantine/core"
import {notifications} from "@mantine/notifications"
import {IconEye, IconEyeFilled} from "@tabler/icons-react"
import {useTranslation} from "react-i18next"

interface Props {
  nodeId: string
}

export default function LibraryWatchToggle({nodeId}: Props) {
  const {t} = useTranslation()
  const {data: watched} = useGetLibraryWatchedQuery()
  const [addWatched, {isLoading: adding}] = useAddLibraryWatchedMutation()
  const [removeWatched, {isLoading: removing}] = useRemoveLibraryWatchedMutation()

  const isWatched = watched?.some(f => f.node_id === nodeId) ?? false
  const loading = adding || removing

  return (
    <Tooltip
      label={isWatched ? t("library.unwatch") : t("library.watch")}
      withArrow
    >
      <ActionIcon
        size="lg"
        variant="default"
        loading={loading}
        onClick={async () => {
          try {
            if (isWatched) {
              await removeWatched(nodeId).unwrap()
            } else {
              await addWatched(nodeId).unwrap()
            }
          } catch {
            notifications.show({
              title: t("library.error"),
              message: "",
              color: "red"
            })
          }
        }}
        aria-label={t("library.watch")}
      >
        {isWatched ? <IconEyeFilled size={18} /> : <IconEye size={18} />}
      </ActionIcon>
    </Tooltip>
  )
}
