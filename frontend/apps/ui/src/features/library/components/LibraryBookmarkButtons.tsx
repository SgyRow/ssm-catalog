import LibraryFavoriteToggle from "@/features/library/components/LibraryFavoriteToggle"
import LibraryWatchToggle from "@/features/library/components/LibraryWatchToggle"
import {Group} from "@mantine/core"

type Props = {
  nodeId?: string
  mspId?: string
  typeSectionId?: string
  size?: "sm" | "md" | "lg"
}

export default function LibraryBookmarkButtons({
  nodeId,
  mspId,
  typeSectionId,
  size = "md"
}: Props) {
  return (
    <Group
      gap={4}
      wrap="nowrap"
      onClick={event => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onMouseDown={event => event.stopPropagation()}
    >
      <LibraryFavoriteToggle
        nodeId={nodeId}
        mspId={mspId}
        typeSectionId={typeSectionId}
        size={size}
      />
      <LibraryWatchToggle
        nodeId={nodeId}
        mspId={mspId}
        typeSectionId={typeSectionId}
        size={size}
      />
    </Group>
  )
}
