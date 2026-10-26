import {Anchor, Box, Breadcrumbs, Text} from "@mantine/core"
import {Link} from "react-router-dom"

import type {BreadcrumbType} from "@/types"

type Props = {
  trail: BreadcrumbType
  /** Folder ids in the trail link here; the last crumb is never linked. */
  folderHref?: (folderId: string) => string
}

export default function PublicBreadcrumbs({
  trail,
  folderHref = id => `/portal/folder/${id}`
}: Props) {
  if (trail.length === 0) {
    return null
  }

  return (
    <Box style={{flex: 1, minWidth: 0}}>
      <Breadcrumbs separator="›">
        {trail.map(([id, title], index) => {
          const isLast = index === trail.length - 1
          return isLast ? (
            <Text key={id} size="sm" fw={600} lineClamp={1}>
              {title}
            </Text>
          ) : (
            <Anchor
              key={id}
              component={Link}
              to={folderHref(id)}
              size="sm"
              lineClamp={1}
            >
              {title}
            </Anchor>
          )
        })}
      </Breadcrumbs>
    </Box>
  )
}
