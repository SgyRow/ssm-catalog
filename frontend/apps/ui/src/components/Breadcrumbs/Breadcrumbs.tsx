import {useAppDispatch, useAppSelector} from "@/app/hooks"
import {updateBreadcrumb} from "@/features/ui/uiSlice"
import {useGetPortalRootQuery} from "@/features/portal/portalApiSlice"
import {isPortalDocumentNavState} from "@/features/portal/portalNavState"
import {PORTAL_VIEW} from "@/scopes"
import {selectCurrentUser} from "@/slices/currentUser"
import type {NType, PanelMode, UserDetails} from "@/types"
import {equalUUIDs} from "@/utils"
import {
  Anchor,
  Group,
  Loader,
  Menu,
  Skeleton,
  UnstyledButton
} from "@mantine/core"
import {
  IconBook2,
  IconCheck,
  IconChevronRight,
  IconDots,
  IconFile,
  IconFolder
} from "@tabler/icons-react"
import {
  forwardRef,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode
} from "react"
import {useTranslation} from "react-i18next"
import {useLocation} from "react-router-dom"

import PanelContext from "@/contexts/PanelContext"
import classes from "./Breadcrumbs.module.css"

type Args = {
  onClick: (node: NType) => void
  className?: string
  breadcrumb?: Array<[string, string]>
  isFetching?: boolean
  /** Last crumb is the open document in the viewer; folders stay the default. */
  leaf?: "folder" | "document"
}

type DisplayCrumb = {
  id: string
  label: string
  icon: ReactNode
  pending: boolean
}

const WIDTH_FUDGE_PX = 2

/**
 * Keep the longest suffix that fits on one line.
 * A leading overflow button is reserved whenever any ancestor is hidden.
 * Returns the index of the first visible crumb.
 */
function pickVisibleStart(
  widths: number[],
  available: number,
  ellipsisWidth: number
): number {
  const count = widths.length
  if (count <= 1 || available <= 0) {
    return 0
  }

  const total = widths.reduce((sum, width) => sum + width, 0)
  if (total <= available - WIDTH_FUDGE_PX) {
    return 0
  }

  let used = 0
  let start = count
  for (let index = count - 1; index >= 0; index--) {
    if (used + widths[index] > available - WIDTH_FUDGE_PX) {
      break
    }
    used += widths[index]
    start = index
  }

  if (start >= count) {
    return count - 1
  }
  if (start === 0) {
    return 0
  }

  while (start < count - 1 && used + ellipsisWidth > available - WIDTH_FUDGE_PX) {
    used -= widths[start]
    start += 1
  }
  return start
}

export default function BreadcrumbsComponent({
  onClick,
  className,
  breadcrumb,
  isFetching,
  leaf = "folder"
}: Args) {
  const dispatch = useAppDispatch()
  const mode: PanelMode = useContext(PanelContext)
  const {t} = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const crumbMeasureRefs = useRef<Array<HTMLSpanElement | null>>([])
  const ellipsisMeasureRef = useRef<HTMLSpanElement | null>(null)
  const lastHeight = useRef<number | null>(null)
  const [visibleStart, setVisibleStart] = useState(0)

  const items = breadcrumb ?? []
  const rootVisual = useFirstCrumbVisual(items[0]?.[0], items[0]?.[1] ?? "")
  const displayItems: DisplayCrumb[] = items.map(([id, title], index) => {
    if (index === 0) {
      return {
        id,
        label: rootVisual.label,
        icon: rootVisual.icon,
        pending: rootVisual.pending
      }
    }
    return {id, label: title, icon: null, pending: false}
  })
  const labelsKey = displayItems.map(item => `${item.id}:${item.label}`).join("|")

  const crumbCount = items.length

  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar || crumbCount === 0) {
      return
    }

    const update = () => {
      const widths: number[] = []
      for (let index = 0; index < crumbCount; index++) {
        widths.push(crumbMeasureRefs.current[index]?.offsetWidth ?? 0)
      }
      const ellipsisWidth = ellipsisMeasureRef.current?.offsetWidth ?? 0
      const next = pickVisibleStart(widths, bar.clientWidth, ellipsisWidth)
      setVisibleStart(prev => (prev === next ? prev : next))
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [labelsKey, crumbCount])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) {
      return
    }

    const report = () => {
      const styles = window.getComputedStyle(el)
      const value =
        el.offsetHeight +
        (parseFloat(styles.marginTop) || 0) +
        (parseFloat(styles.marginBottom) || 0)
      if (lastHeight.current === value) {
        return
      }
      lastHeight.current = value
      dispatch(updateBreadcrumb({mode, value}))
    }

    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => observer.disconnect()
  }, [mode, dispatch, labelsKey, visibleStart, Boolean(breadcrumb)])

  if (!breadcrumb || breadcrumb.length === 0) {
    return (
      <Skeleton ref={ref} width={"25%"} my={0}>
        <span className={classes.current}>…</span>
      </Skeleton>
    )
  }

  const visibleItems = displayItems.slice(visibleStart)
  const collapsed = visibleStart > 0
  const fullPathLabel = t("breadcrumb.show_full_path")

  const openFolder = (id: string) => {
    onClick({id, ctype: "folder"})
  }

  return (
    <Group
      ref={ref}
      my={0}
      gap={6}
      wrap="nowrap"
      align="center"
      className={className}
      style={{minWidth: 0, width: "100%"}}
    >
      <div ref={barRef} className={classes.bar}>
        <div className={classes.measure} aria-hidden>
          {displayItems.map((item, index) => (
            <span
              key={item.id}
              ref={node => {
                crumbMeasureRefs.current[index] = node
              }}
              className={classes.measureItem}
            >
              <CrumbContent item={item} />
              {index < displayItems.length - 1 && <Separator />}
            </span>
          ))}
          <span
            ref={ellipsisMeasureRef}
            className={classes.measureItem}
          >
            <OverflowButton label={fullPathLabel} tabIndex={-1} />
            <Separator />
          </span>
        </div>

        {collapsed && (
          <PathMenu
            items={displayItems}
            leaf={leaf}
            label={fullPathLabel}
            onOpenFolder={openFolder}
          />
        )}
        {visibleItems.map((item, index) => {
          const absoluteIndex = visibleStart + index
          const isLast = absoluteIndex === displayItems.length - 1
          return (
            <span key={item.id} className={classes.segment}>
              {(collapsed || index > 0) && <Separator />}
              {isLast ? (
                <span className={classes.current} title={item.label}>
                  <CrumbContent item={item} />
                </span>
              ) : (
                <Anchor
                  className={classes.link}
                  title={item.label}
                  onClick={() => openFolder(item.id)}
                >
                  <CrumbContent item={item} />
                </Anchor>
              )}
            </span>
          )
        })}
      </div>
      {isFetching && <Loader size={"sm"} />}
    </Group>
  )
}

function CrumbContent({item}: {item: DisplayCrumb}) {
  if (item.pending) {
    return <Skeleton width={72} height={14} />
  }
  if (!item.icon) {
    return <span>{item.label}</span>
  }
  return (
    <span className={classes.rootLabel}>
      {item.icon}
      <span>{item.label}</span>
    </span>
  )
}

function Separator() {
  return (
    <span className={classes.sep} aria-hidden>
      <IconChevronRight size={12} stroke={1.5} />
    </span>
  )
}

const OverflowButton = forwardRef<
  HTMLButtonElement,
  {label: string} & ComponentPropsWithoutRef<"button">
>(function OverflowButton({label, ...others}, ref) {
  return (
    <UnstyledButton
      {...others}
      ref={ref}
      className={classes.ellipsis}
      aria-label={label}
      title={label}
      type="button"
    >
      <IconDots size={16} />
    </UnstyledButton>
  )
})

function PathMenu({
  items,
  leaf,
  label,
  onOpenFolder
}: {
  items: DisplayCrumb[]
  leaf: "folder" | "document"
  label: string
  onOpenFolder: (id: string) => void
}) {
  return (
    <Menu
      position="bottom-start"
      shadow="md"
      withinPortal
      offset={4}
    >
      <Menu.Target>
        <OverflowButton label={label} />
      </Menu.Target>
      <Menu.Dropdown className={classes.menu}>
        <Menu.Label>{label}</Menu.Label>
        {items.map((item, index) => {
          const isLeaf = index === items.length - 1
          const icon =
            item.icon ??
            (isLeaf && leaf === "document" ? (
              <IconFile size={14} />
            ) : (
              <IconFolder size={14} />
            ))
          return (
            <Menu.Item
              key={item.id}
              className={classes.menuItem}
              leftSection={icon}
              rightSection={isLeaf ? <IconCheck size={14} /> : null}
              style={{paddingInlineStart: 8 + index * 14}}
              onClick={isLeaf ? undefined : () => onOpenFolder(item.id)}
            >
              <span className={classes.menuLabel}>{item.label}</span>
            </Menu.Item>
          )
        })}
      </Menu.Dropdown>
    </Menu>
  )
}

function useFirstCrumbVisual(itemId: string | undefined, fallbackTitle: string) {
  const {t} = useTranslation()
  const location = useLocation()
  const user = useAppSelector(selectCurrentUser) as UserDetails | undefined
  const portalNav = isPortalDocumentNavState(location.state)
    ? location.state
    : null
  const scopes = user?.scopes ?? []
  const {data: portalRoot} = useGetPortalRootQuery(undefined, {
    skip: !scopes.includes(PORTAL_VIEW)
  })

  const portalRootLabel = t("portal.root_folder")
  const isPortal =
    Boolean(itemId) &&
    ((portalNav && equalUUIDs(itemId!, portalNav.portalRootId)) ||
      (portalRoot && equalUUIDs(itemId!, portalRoot.id)))

  if (isPortal) {
    return {
      pending: false,
      label: portalRootLabel,
      icon: <IconBook2 size={16} />
    }
  }
  if (!user) {
    return {
      pending: true,
      label: fallbackTitle,
      icon: <IconFolder size={16} />
    }
  }
  return {
    pending: false,
    label: fallbackTitle,
    icon: <IconFolder size={16} />
  }
}
