import {
  useAddLibraryWatchedMspSectionMutation,
  useAddLibraryWatchedMutation,
  useGetLibraryWatchedQuery,
  useRemoveLibraryWatchedMspSectionMutation,
  useRemoveLibraryWatchedMutation
} from "@/features/library/libraryApiSlice"
import {ActionIcon, Tooltip} from "@mantine/core"
import {notifications} from "@mantine/notifications"
import {IconEye, IconEyeFilled} from "@tabler/icons-react"
import {useTranslation} from "react-i18next"

interface Props {
  nodeId?: string
  mspId?: string
  typeSectionId?: string
  size?: "sm" | "md" | "lg"
}

export default function LibraryWatchToggle({
  nodeId,
  mspId,
  typeSectionId,
  size = "lg"
}: Props) {
  const {t} = useTranslation()
  const {data: watched} = useGetLibraryWatchedQuery()
  const [addWatched, {isLoading: addingNode}] = useAddLibraryWatchedMutation()
  const [removeWatched, {isLoading: removingNode}] =
    useRemoveLibraryWatchedMutation()
  const [addSection, {isLoading: addingSection}] =
    useAddLibraryWatchedMspSectionMutation()
  const [removeSection, {isLoading: removingSection}] =
    useRemoveLibraryWatchedMspSectionMutation()

  const isSection = Boolean(mspId && typeSectionId)
  const isWatched =
    watched?.some(f =>
      isSection
        ? f.msp_id === mspId && f.type_section_id === typeSectionId
        : f.node_id === nodeId && !f.type_section_id
    ) ?? false
  const loading =
    addingNode || removingNode || addingSection || removingSection

  if (!isSection && !nodeId) {
    return null
  }

  return (
    <Tooltip
      label={isWatched ? t("library.unwatch") : t("library.watch")}
      withArrow
    >
      <ActionIcon
        size={size}
        variant="default"
        loading={loading}
        onClick={async event => {
          event.preventDefault()
          event.stopPropagation()
          try {
            if (isSection && mspId && typeSectionId) {
              if (isWatched) {
                await removeSection({mspId, typeSectionId}).unwrap()
              } else {
                await addSection({mspId, typeSectionId}).unwrap()
              }
              return
            }
            if (!nodeId) {
              return
            }
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
