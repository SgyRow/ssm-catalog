import {useGetFeedbackUnreadQuery} from "@/features/feedback/feedbackApiSlice"
import {useGetPortalRootQuery} from "@/features/portal/portalApiSlice"
import {selectNavBarCollapsed} from "@/features/ui/uiSlice"
import {
  FEEDBACK_MANAGE,
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
import {Center, Group, Indicator, Loader, Text} from "@mantine/core"
import {
  IconMasksTheater,
  IconNews,
  IconTag,
  IconUsers,
  IconBookmark,
  IconClipboardList,
  IconDatabaseExport,
  IconBook2,
  IconHome,
  IconMessages,
  IconNotebook,
  IconUsersGroup
} from "@tabler/icons-react"
import {useSelector} from "react-redux"
import {Link, NavLink, useLocation} from "react-router-dom"

import {useGetVersionQuery} from "@/features/version/apiSlice"
import type {UserDetails} from "@/types.ts"
import {useTranslation} from "react-i18next"

function useNavActive() {
  const {pathname} = useLocation()
  return {
    home: pathname === "/portal",
    catalog:
      pathname.startsWith("/portal/folder/") || pathname === "/portal/folder",
    citizenCategories:
      pathname === "/citizen-categories" ||
      pathname.startsWith("/citizen-categories/"),
    handbook: pathname === "/handbook" || pathname.startsWith("/handbook/"),
    library: pathname === "/library" || pathname.startsWith("/library/"),
    feedback: pathname === "/feedback" || pathname.startsWith("/feedback/")
  }
}

function canOpenFeedbackInbox(user: UserDetails | null): boolean {
  if (!user) {
    return false
  }
  return user.is_superuser || (user.scopes ?? []).includes(FEEDBACK_MANAGE)
}

function NavBarFull() {
  const {t} = useTranslation()
  const active = useNavActive()
  const {data, isLoading} = useGetVersionQuery()

  const user = useSelector(selectCurrentUser) as UserDetails
  const status = useSelector(selectCurrentUserStatus)
  const error = useSelector(selectCurrentUserError)
  const scopes = user?.scopes ?? []
  const {data: portalRoot} = useGetPortalRootQuery(undefined, {
    skip: status !== "succeeded" || !scopes.includes(PORTAL_VIEW)
  })
  const catalogPath = portalRoot ? `/portal/folder/${portalRoot.id}` : "/portal"

  if (status == "loading" || isLoading) {
    return <>{t("common.loading")}</>
  }

  if (status == "failed") {
    return <>{error}</>
  }

  if (!user) {
    return <>{t("common.loading")}</>
  }

  return (
    <>
      <div className="navbar">
        {scopes.includes(PORTAL_VIEW) && (
          <Link to="/portal" className={active.home ? "active" : undefined}>
          <Group wrap="nowrap" gap="xs">
            <IconHome />
            {t("portal.home")}
          </Group>
          </Link>
        )}
        {scopes.includes(PORTAL_VIEW) && portalRoot && (
          <Link
            to={catalogPath}
            className={active.catalog ? "active" : undefined}
          >
            <Group wrap="nowrap" gap="xs">
              <IconBook2 />
              {t("portal.catalog_nav")}
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
          className={active.citizenCategories ? "active" : undefined}
        >
          <Group wrap="nowrap" gap="xs">
            <IconUsersGroup />
            {t("citizen_categories.nav")}
          </Group>
        </Link>
        <Link
          to="/handbook"
          className={active.handbook ? "active" : undefined}
        >
          <Group wrap="nowrap" gap="xs">
            <IconNotebook />
            {t("handbook.nav")}
          </Group>
        </Link>
        {scopes.includes(NODE_VIEW) && (
          <Link
            to="/library/favorites"
            className={active.library ? "active" : undefined}
          >
            <Group wrap="nowrap" gap="xs">
              <IconBookmark />
              {t("library.nav")}
            </Group>
          </Link>
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
        {canOpenFeedbackInbox(user) && (
          <FeedbackInboxNav collapsed={false} />
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
  const active = useNavActive()
  const {data, isLoading} = useGetVersionQuery()

  const user = useSelector(selectCurrentUser) as UserDetails
  const status = useSelector(selectCurrentUserStatus)
  const error = useSelector(selectCurrentUserError)
  const scopes = user?.scopes ?? []
  const {data: portalRoot} = useGetPortalRootQuery(undefined, {
    skip: status !== "succeeded" || !scopes.includes(PORTAL_VIEW)
  })
  const catalogPath = portalRoot ? `/portal/folder/${portalRoot.id}` : "/portal"

  if (status == "loading" || isLoading) {
    return <>{t("common.loading")}</>
  }

  if (status == "failed") {
    return <>{error}</>
  }

  if (!user) {
    return <>{t("common.loading")}</>
  }

  return (
    <>
      <div className="navbar">
        {scopes.includes(PORTAL_VIEW) && (
          <Link to="/portal" className={active.home ? "active" : undefined}>
            <Group>
              <IconHome />
            </Group>
          </Link>
        )}
        {scopes.includes(PORTAL_VIEW) && portalRoot && (
          <Link
            to={catalogPath}
            className={active.catalog ? "active" : undefined}
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
          className={active.citizenCategories ? "active" : undefined}
        >
          <Group wrap="nowrap" gap="xs">
            <IconUsersGroup />
          </Group>
        </Link>
        <Link
          to="/handbook"
          className={active.handbook ? "active" : undefined}
        >
          <Group>
            <IconNotebook />
          </Group>
        </Link>
        {scopes.includes(NODE_VIEW) && (
          <Link
            to="/library/favorites"
            className={active.library ? "active" : undefined}
          >
            <Group>
              <IconBookmark />
            </Group>
          </Link>
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
        {canOpenFeedbackInbox(user) && <FeedbackInboxNav collapsed />}
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

function FeedbackInboxNav({collapsed}: {collapsed: boolean}) {
  const {t} = useTranslation()
  const active = useNavActive()
  const {data} = useGetFeedbackUnreadQuery(undefined, {
    pollingInterval: 15000
  })
  const unread = data?.inbox ?? 0
  const icon = (
    <Indicator disabled={unread <= 0} size={8} offset={2}>
      <IconMessages />
    </Indicator>
  )
  return (
    <Link
      to="/feedback"
      className={active.feedback ? "active" : undefined}
    >
      <Group wrap="nowrap" gap="xs">
        {icon}
        {collapsed ? null : t("feedback.inbox_nav")}
      </Group>
    </Link>
  )
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
