import {
  useAddLibraryFavoriteMspSectionMutation,
  useAddLibraryFavoriteMutation,
  useGetLibraryFavoritesQuery,
  useRemoveLibraryFavoriteMspSectionMutation,
  useRemoveLibraryFavoriteMutation
} from "@/features/library/libraryApiSlice"
import {ActionIcon, Tooltip} from "@mantine/core"
import {notifications} from "@mantine/notifications"
import {IconStar, IconStarFilled} from "@tabler/icons-react"
import {useTranslation} from "react-i18next"

interface Props {
  nodeId?: string
  mspId?: string
  typeSectionId?: string
  size?: "sm" | "md" | "lg"
}

export default function LibraryFavoriteToggle({
  nodeId,
  mspId,
  typeSectionId,
  size = "lg"
}: Props) {
  const {t} = useTranslation()
  const {data: favorites} = useGetLibraryFavoritesQuery()
  const [addFav, {isLoading: addingNode}] = useAddLibraryFavoriteMutation()
  const [removeFav, {isLoading: removingNode}] =
    useRemoveLibraryFavoriteMutation()
  const [addSection, {isLoading: addingSection}] =
    useAddLibraryFavoriteMspSectionMutation()
  const [removeSection, {isLoading: removingSection}] =
    useRemoveLibraryFavoriteMspSectionMutation()

  const isSection = Boolean(mspId && typeSectionId)
  const isFav =
    favorites?.some(f =>
      isSection
        ? f.msp_id === mspId && f.type_section_id === typeSectionId
        : f.node_id === nodeId && !f.type_section_id
    ) ?? false
  const loading = addingNode || removingNode || addingSection || removingSection

  if (!isSection && !nodeId) {
    return null
  }

  return (
    <Tooltip
      label={isFav ? t("library.unfavorite") : t("library.favorite")}
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
              if (isFav) {
                await removeSection({mspId, typeSectionId}).unwrap()
              } else {
                await addSection({mspId, typeSectionId}).unwrap()
              }
              return
            }
            if (!nodeId) {
              return
            }
            if (isFav) {
              await removeFav(nodeId).unwrap()
            } else {
              await addFav(nodeId).unwrap()
            }
          } catch {
            notifications.show({
              title: t("library.error"),
              color: "red"
            })
          }
        }}
        aria-label={t("library.favorite")}
      >
        {isFav ? <IconStarFilled size={18} /> : <IconStar size={18} />}
      </ActionIcon>
    </Tooltip>
  )
}
