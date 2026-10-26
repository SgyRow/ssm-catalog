import type {BreadcrumbType} from "@/types/breadcrumb"
import {equalUUIDs} from "@/utils"

export function normalizeSearchBreadcrumb(
  breadcrumb: BreadcrumbType | null | undefined,
  portalRootId: string | undefined,
  portalRootLabel: string
): BreadcrumbType | null | undefined {
  if (!breadcrumb?.length || !portalRootId) {
    return breadcrumb
  }

  return breadcrumb.map(([id, title]) =>
    equalUUIDs(id, portalRootId) ? [id, portalRootLabel] : [id, title]
  ) as BreadcrumbType
}
