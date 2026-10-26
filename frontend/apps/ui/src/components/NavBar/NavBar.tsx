import {selectNavBarCollapsed} from "@/features/ui/uiSlice"
import {
  NODE_VIEW,
  PORTAL_FEED_VIEW,
  PORTAL_VIEW,
  ROLE_VIEW,
  TAG_SELECT,
  TAG_VIEW,
  USER_VIEW,
  canManageTags
} from "@/scopes"
import {
  selectCurrentUser,
  selectCurrentUserError,
  selectCurrentUserStatus
} from "@/slices/currentUser.ts"
import {Center, Group, Loader, Text} from "@mantine/core"
import {
  IconMasksTheater,
  IconNews,
  IconTag,
  IconUsers,
  IconBookmark,
  IconClipboardList,
  IconDatabaseExport,
  IconBook2,
  IconUsersGroup
} from "@tabler/icons-react"
import {useSelector} from "react-redux"
import {Link, NavLink, useLocation} from "react-router-dom"

import {useGetVersionQuery} from "@/features/version/apiSlice"
import type {UserDetails} from "@/types.ts"
import {useTranslation} from "react-i18next"

function NavBarFull() {
  const {t} = useTranslation()
  const {pathname} = useLocation()
  const {data, isLoading} = useGetVersionQuery()
  const portalCatalogNavActive =
    pathname === "/portal" || pathname.startsWith("/portal/folder/")
  const citizenCategoriesNavActive =
    pathname === "/citizen-categories" ||
    pathname.startsWith("/citizen-categories/")

  const user = useSelector(selectCurrentUser) as UserDetails
  const status = useSelector(selectCurrentUserStatus)
  const error = useSelector(selectCurrentUserError)

  if (status == "loading" || isLoading) {
    return <>{t("common.loading")}</>
  }

  if (status == "failed") {
    return <>{error}</>
  }

  if (!user) {
    return <>{t("common.loading")}</>
  }

  const scopes = user.scopes ?? []

  return (
    <>
      <div className="navbar">
        {scopes.includes(PORTAL_VIEW) && (
          <Link
            to="/portal"
            className={portalCatalogNavActive ? "active" : undefined}
          >
          <Group wrap="nowrap" gap="xs">
            <IconBook2 />
            {t("portal.home")}
          </Group>
          </Link>
        )}
        {scopes.includes(PORTAL_FEED_VIEW) && (
          <NavLink to="/portal/feed" end>
            {NavLinkWithFeedback(t("portal.feed_nav"), <IconNews />)}
          </NavLink>
        )}
        <Link
          to="/citizen-categories"
          className={citizenCategoriesNavActive ? "active" : undefined}
        >
          <Group wrap="nowrap" gap="xs">
            <IconUsersGroup />
            {t("citizen_categories.nav")}
          </Group>
        </Link>
        {scopes.includes(NODE_VIEW) && (
          <NavLink to="/library/favorites">
            {NavLinkWithFeedback(t("library.nav"), <IconBookmark />)}
          </NavLink>
        )}
        {(scopes.includes(TAG_VIEW) ||
          scopes.includes(TAG_SELECT) ||
          canManageTags(scopes)) && (
          <NavLink to="/tags">
            {NavLinkWithFeedback(t("tags.name"), <IconTag />)}
          </NavLink>
        )}
        {scopes.includes(USER_VIEW) && (
          <NavLink to="/users">
            {NavLinkWithFeedback(t("users.name"), <IconUsers />)}
          </NavLink>
        )}
        {scopes.includes(ROLE_VIEW) && (
          <NavLink to="/roles">
            {NavLinkWithFeedback(t("roles.name"), <IconMasksTheater />)}
          </NavLink>
        )}
        {user.is_superuser && (
          <>
            <NavLink to="/audit-log">
              {NavLinkWithFeedback(t("audit_log.nav"), <IconClipboardList />)}
            </NavLink>
            <NavLink to="/admin/backup">
              {NavLinkWithFeedback(t("backup.nav"), <IconDatabaseExport />)}
            </NavLink>
          </>
        )}
      </div>
      <Center className="navbar-bg-color">
        <Text size="sm" c="dimmed">
          {t("app.version")} {data && data?.version}
        </Text>
      </Center>
    </>
  )
}

function NavBarCollapsed() {
  const {t} = useTranslation()
  const {pathname} = useLocation()
  const {data, isLoading} = useGetVersionQuery()
  const portalCatalogNavActive =
    pathname === "/portal" || pathname.startsWith("/portal/folder/")
  const citizenCategoriesNavActive =
    pathname === "/citizen-categories" ||
    pathname.startsWith("/citizen-categories/")

  const user = useSelector(selectCurrentUser) as UserDetails
  const status = useSelector(selectCurrentUserStatus)
  const error = useSelector(selectCurrentUserError)

  if (status == "loading" || isLoading) {
    return <>{t("common.loading")}</>
  }

  if (status == "failed") {
    return <>{error}</>
  }

  if (!user) {
    return <>{t("common.loading")}</>
  }

  const scopes = user.scopes ?? []

  return (
    <>
      <div className="navbar">
        {scopes.includes(PORTAL_VIEW) && (
          <Link
            to="/portal"
            className={portalCatalogNavActive ? "active" : undefined}
          >
            <Group>
              <IconBook2 />
            </Group>
          </Link>
        )}
        {scopes.includes(PORTAL_FEED_VIEW) && (
          <NavLink to="/portal/feed" end>
            {NavLinkWithFeedbackShort(<IconNews />)}
          </NavLink>
        )}
        <Link
          to="/citizen-categories"
          className={citizenCategoriesNavActive ? "active" : undefined}
        >
          <Group wrap="nowrap" gap="xs">
            <IconUsersGroup />
          </Group>
        </Link>
        {scopes.includes(NODE_VIEW) && (
          <NavLink to="/library/favorites">
            {NavLinkWithFeedbackShort(<IconBookmark />)}
          </NavLink>
        )}
        {(scopes.includes(TAG_VIEW) ||
          scopes.includes(TAG_SELECT) ||
          canManageTags(scopes)) && (
          <NavLink to="/tags">{NavLinkWithFeedbackShort(<IconTag />)}</NavLink>
        )}
        {scopes.includes(USER_VIEW) && (
          <NavLink to="/users">
            {NavLinkWithFeedbackShort(<IconUsers />)}
          </NavLink>
        )}
        {scopes.includes(ROLE_VIEW) && (
          <NavLink to="/roles">
            {NavLinkWithFeedbackShort(<IconMasksTheater />)}
          </NavLink>
        )}
        {user.is_superuser && (
          <>
            <NavLink to="/audit-log">
              {NavLinkWithFeedbackShort(<IconClipboardList />)}
            </NavLink>
            <NavLink to="/admin/backup">
              {NavLinkWithFeedbackShort(<IconDatabaseExport />)}
            </NavLink>
          </>
        )}
      </div>
      <Center className="navbar-bg-color">
        <Text size="sm" c="dimmed">
          {data && data?.version}
        </Text>
      </Center>
    </>
  )
}

function NavBar() {
  const collapsed = useSelector(selectNavBarCollapsed)

  if (collapsed) {
    return <NavBarCollapsed />
  }

  return <NavBarFull />
}

type NavLinkState = {
  isActive: boolean
  isPending: boolean
}

type ResponsiveLink = ({isActive, isPending}: NavLinkState) => React.JSX.Element

function NavLinkWithFeedback(
  text: string,
  icon: React.JSX.Element
): ResponsiveLink {
  return ({isActive, isPending}) => {
    if (isActive) {
      return (
        <Group wrap="nowrap" gap="xs">
          {icon}
          {text}
        </Group>
      )
    }
    if (isPending) {
      return (
        <Group wrap="nowrap" gap="xs">
          {icon}
          {text}
          <Loader size={"sm"} />
        </Group>
      )
    }
    return (
      <Group wrap="nowrap" gap="xs">
        {icon}
        {text}
      </Group>
    )
  }
}

function NavLinkWithFeedbackShort(icon: React.JSX.Element): ResponsiveLink {
  return ({isActive, isPending}) => {
    if (isActive) {
      return <Group>{icon}</Group>
    }
    if (isPending) {
      return (
        <Group>
          <Loader size={"sm"} />
        </Group>
      )
    }
    return <Group>{icon}</Group>
  }
}

export default NavBar
