import {
  useAddLibraryFavoriteMutation,
  useGetLibraryFavoritesQuery,
  useRemoveLibraryFavoriteMutation
} from "@/features/library/libraryApiSlice"
import {ActionIcon, Tooltip} from "@mantine/core"
import {notifications} from "@mantine/notifications"
import {IconStar, IconStarFilled} from "@tabler/icons-react"
import {useTranslation} from "react-i18next"

interface Props {
  nodeId: string
}

export default function LibraryFavoriteToggle({nodeId}: Props) {
  const {t} = useTranslation()
  const {data: favorites} = useGetLibraryFavoritesQuery()
  const [addFav, {isLoading: adding}] = useAddLibraryFavoriteMutation()
  const [removeFav, {isLoading: removing}] = useRemoveLibraryFavoriteMutation()

  const isFav = favorites?.some(f => f.node_id === nodeId) ?? false
  const loading = adding || removing

  return (
    <Tooltip
      label={isFav ? t("library.unfavorite") : t("library.favorite")}
      withArrow
    >
      <ActionIcon
        size="lg"
        variant="default"
        loading={loading}
        onClick={async () => {
          try {
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
