import {openNotificationsMenu} from "@/components/Header/notificationsMenuControl"
import classes from "@/features/portal/homePage.module.css"
import {
  useGetLibraryFavoritesQuery,
  useGetLibraryNotificationsQuery,
  useMarkLibraryNotificationReadMutation
} from "@/features/library/libraryApiSlice"
import {useGetHandbookArticlesQuery} from "@/features/handbook/handbookApiSlice"
import {
  useGetPortalFeedQuery,
  useGetPortalNodesQuery,
  useGetPortalRootQuery,
  type PortalNewsItem
} from "@/features/portal/portalApiSlice"
import {makePortalDocumentNavState} from "@/features/portal/portalNavState"
import {
  NODE_VIEW,
  PORTAL_FEED_VIEW,
  PORTAL_VIEW,
  USER_ME
} from "@/scopes"
import {selectCurrentUser} from "@/slices/currentUser"
import type {UserDetails} from "@/types"
import {drop_extension, formatNodeDisplayTitle} from "@/utils"
import {formatApiDateTimeCompact} from "@/utils/formatDateTime"
import {Loader, Text} from "@mantine/core"
import {
  IconBell,
  IconBookmark,
  IconFolder,
  IconNews,
  IconNotebook,
  IconSearch,
  IconStar,
  IconUsersGroup
} from "@tabler/icons-react"
import {useMemo} from "react"
import {useSelector} from "react-redux"
import {Link} from "react-router-dom"
import {useTranslation} from "react-i18next"

const NEWS_PREVIEW = 3
const FAVORITES_PREVIEW = 4
const ALERTS_PREVIEW = 4

function isMspFolderTitle(title: string): boolean {
  const n = title.toLowerCase()
  return n.includes("мер") || n.includes("поддержк") || n.includes("мсп")
}

type AlertView = {
  id: string
  title: string
  meta: string
  href: string
  unread: boolean
}

export default function PortalHomePage() {
  const {t} = useTranslation()
  const user = useSelector(selectCurrentUser) as UserDetails | null
  const scopes = user?.scopes ?? []
  const canBrowsePortal = scopes.includes(PORTAL_VIEW)
  const canViewFeed = scopes.includes(PORTAL_FEED_VIEW)
  const canViewFavorites = scopes.includes(NODE_VIEW)
  const canViewAlerts = scopes.includes(USER_ME)

  const {data: portalRoot, isLoading: rootLoading} = useGetPortalRootQuery(
    undefined,
    {skip: !canBrowsePortal}
  )

  const {data: rootNodes} = useGetPortalNodesQuery(
    {parentId: portalRoot?.id ?? "", page_size: 100},
    {skip: !canBrowsePortal || !portalRoot?.id}
  )

  const {data: feed} = useGetPortalFeedQuery(
    {page: 1, page_size: NEWS_PREVIEW},
    {skip: !canViewFeed}
  )

  const {data: favorites} = useGetLibraryFavoritesQuery(undefined, {
    skip: !canViewFavorites
  })
  const {data: handbook} = useGetHandbookArticlesQuery()

  const {data: alerts} = useGetLibraryNotificationsQuery(50, {
    skip: !canViewAlerts
  })
  const [markAlertRead] = useMarkLibraryNotificationReadMutation()

  const documentNavState = useMemo(
    () => (portalRoot ? makePortalDocumentNavState(portalRoot) : null),
    [portalRoot]
  )

  const catalogPath = portalRoot ? `/portal/folder/${portalRoot.id}` : "/portal"
  const mspFolder = (rootNodes?.items ?? []).find(
    row => row.ctype === "folder" && isMspFolderTitle(row.title)
  )
  const mspPath = mspFolder ? `/portal/folder/${mspFolder.id}` : catalogPath

  const newsItems = feed?.items ?? []
  const favoriteRows = (favorites ?? [])
    .filter(row => !row.in_trash)
    .slice(0, FAVORITES_PREVIEW)

  const alertRows = useMemo<AlertView[]>(() => {
    const rows = (alerts ?? []).filter(n => n.kind !== "ocr_completed")
    return rows.slice(0, ALERTS_PREVIEW).map(n => {
      let title = n.kind
      let meta = formatApiDateTimeCompact(n.created_at)
      let href = "/library/favorites"
      if (n.kind === "portal_feed_published") {
        title = t("library.notification.portal_feed_published.title")
        href = "/portal/feed"
        try {
          const parsed = n.payload ? JSON.parse(n.payload) : {}
          const newsTitle = String(parsed.title ?? "").trim()
          const author = String(parsed.author_username ?? "").trim()
          const when = formatApiDateTimeCompact(n.created_at)
          meta = [newsTitle, author, when].filter(Boolean).join(" · ")
        } catch {
          meta = formatApiDateTimeCompact(n.created_at)
        }
      }
      if (n.kind === "feedback_wish") {
        title = t("library.notification.feedback_wish.title")
        try {
          const parsed = n.payload ? JSON.parse(n.payload) : {}
          const subject = String(parsed.subject ?? "").trim()
          const username = String(parsed.username ?? "").trim()
          const wishId = String(parsed.wish_id ?? "").trim()
          href = wishId ? `/feedback?wish=${wishId}` : "/feedback?tab=wishes"
          meta = [username, subject, formatApiDateTimeCompact(n.created_at)]
            .filter(Boolean)
            .join(" · ")
        } catch {
          href = "/feedback?tab=wishes"
          meta = formatApiDateTimeCompact(n.created_at)
        }
      }
      if (n.kind === "feedback_message") {
        title = t("library.notification.feedback_message.title")
        try {
          const parsed = n.payload ? JSON.parse(n.payload) : {}
          const preview = String(parsed.preview ?? "").trim()
          const username = String(parsed.username ?? "").trim()
          const fromStaff = Boolean(parsed.from_staff)
          const threadId = String(parsed.thread_id ?? "").trim()
          href = fromStaff
            ? "/portal?feedback=1"
            : threadId
              ? `/feedback?thread=${threadId}`
              : "/feedback"
          meta = [fromStaff ? "" : username, preview, formatApiDateTimeCompact(n.created_at)]
            .filter(Boolean)
            .join(" · ")
        } catch {
          href = "/portal?feedback=1"
          meta = formatApiDateTimeCompact(n.created_at)
        }
      }
      return {
        id: n.id,
        title,
        meta,
        href,
        unread: !n.read_at
      }
    })
  }, [alerts, t])

  const unreadCount =
    (alerts ?? []).filter(n => !n.read_at && n.kind !== "ocr_completed").length

  if (canBrowsePortal && rootLoading) {
    return <Loader />
  }

  return (
    <div className={classes.page}>
      <div className={classes.scroll} style={{padding: "16px 20px 28px"}}>
        <div className={classes.head}>
          <h1>{t("portal.home")}</h1>
        </div>

        <div className={classes.jumps}>
          {canBrowsePortal ? (
            <Link className={classes.jump} to={mspPath}>
              <span className={classes.mark}>
                <IconFolder size={18} stroke={1.8} />
              </span>
              <span>
                <span className={classes.jumpTitle}>
                  {t("home.jump_msp")}
                </span>
                <span className={classes.jumpSub}>
                  {t("portal.catalog_nav")}
                </span>
              </span>
            </Link>
          ) : null}
          <Link className={classes.jump} to="/citizen-categories">
            <span className={classes.mark}>
              <IconUsersGroup size={18} stroke={1.8} />
            </span>
            <span>
              <span className={classes.jumpTitle}>
                {t("home.jump_categories")}
              </span>
              <span className={classes.jumpSub}>
                {t("citizen_categories.nav")}
              </span>
            </span>
          </Link>
          <Link className={classes.jump} to="/search?advanced=1">
            <span className={classes.mark}>
              <IconSearch size={18} stroke={1.8} />
            </span>
            <span>
              <span className={classes.jumpTitle}>{t("home.jump_search")}</span>
              <span className={classes.jumpSub}>
                {t("home.jump_search_sub")}
              </span>
            </span>
          </Link>
          <Link className={classes.jump} to="/handbook">
            <span className={classes.mark}>
              <IconNotebook size={18} stroke={1.8} />
            </span>
            <span>
              <span className={classes.jumpTitle}>
                {t("handbook.title")}
              </span>
            </span>
          </Link>
        </div>

        <div className={classes.cols}>
          <section className={classes.card}>
            <div className={classes.cardHead}>
              <h2>
                <IconNews size={20} stroke={1.8} />
                {t("portal.feed_title")}
              </h2>
              {canViewFeed ? (
                <Link className={classes.more} to="/portal/feed">
                  {t("home.news_all")}
                </Link>
              ) : null}
            </div>
            {!canViewFeed ? (
              <div className={classes.empty}>{t("portal.feed_forbidden")}</div>
            ) : newsItems.length === 0 ? (
              <div className={classes.empty}>{t("portal.feed_empty")}</div>
            ) : (
              newsItems.map(item => (
                <NewsPreview
                  key={item.id}
                  item={item}
                  documentNavState={documentNavState}
                />
              ))
            )}
          </section>

          <section className={classes.card}>
            <div className={classes.cardHead}>
              <h2>
                <IconNotebook size={20} stroke={1.8} />
                {t("handbook.title")}
              </h2>
              <Link className={classes.more} to="/handbook">
                {t("home.handbook_open")}
              </Link>
            </div>
            {(handbook ?? []).length === 0 ? (
              <div className={classes.handbookBody} />
            ) : (
              (handbook ?? []).slice(0, 4).map(item => (
                <Link
                  key={item.id}
                  className={classes.row}
                  to={`/handbook/${item.id}`}
                >
                  <span className={classes.grow}>
                    {item.title}
                    <span className={classes.sub}>
                      {formatApiDateTimeCompact(item.updated_at)}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </section>

          <div className={classes.stack}>
            {canViewAlerts ? (
              <section className={classes.alerts} aria-label={t("home.alerts")}>
                <div className={classes.alertsHead}>
                  <h2>
                    <IconBell size={18} stroke={1.8} />
                    {t("home.alerts")}
                    {unreadCount > 0 ? (
                      <span className={classes.badge}>
                        {t("home.alerts_badge", {count: unreadCount})}
                      </span>
                    ) : null}
                  </h2>
                  <button
                    type="button"
                    className={classes.more}
                    onClick={() => openNotificationsMenu()}
                  >
                    {t("home.alerts_all")}
                  </button>
                </div>
                {alertRows.length === 0 ? (
                  <div className={classes.empty}>
                    {t("library.empty_notifications")}
                  </div>
                ) : (
                  alertRows.map(row => (
                    <Link
                      key={row.id}
                      className={classes.alert}
                      to={row.href}
                      onClick={() => {
                        if (row.unread) {
                          void markAlertRead(row.id)
                        }
                      }}
                    >
                      <span
                        className={row.unread ? classes.dot : classes.dotRead}
                      />
                      <span>
                        <span className={classes.alertTitle}>{row.title}</span>
                        <span className={classes.alertMeta}>{row.meta}</span>
                      </span>
                    </Link>
                  ))
                )}
              </section>
            ) : null}

            {canViewFavorites ? (
              <section className={classes.card}>
                <div className={classes.cardHead}>
                  <h2>
                    <IconBookmark size={20} stroke={1.8} />
                    {t("home.favorites")}
                  </h2>
                  <Link className={classes.more} to="/library/favorites">
                    {t("home.favorites_all")}
                  </Link>
                </div>
                {favoriteRows.length === 0 ? (
                  <div className={classes.empty}>
                    {t("library.empty_favorites")}
                  </div>
                ) : (
                  favoriteRows.map(row => (
                    <Link
                      key={row.node_id}
                      className={classes.row}
                      to={
                        row.ctype === "folder"
                          ? `/folder/${row.node_id}`
                          : `/document/${row.node_id}`
                      }
                    >
                      <IconStar className={classes.star} size={18} fill="currentColor" />
                      <span className={classes.grow}>
                        {formatNodeDisplayTitle(row.title, row.ctype)}
                        <span className={classes.sub}>
                          {row.ctype === "folder"
                            ? t("portal.type_folder")
                            : t("portal.type_document")}
                        </span>
                      </span>
                    </Link>
                  ))
                )}
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function NewsPreview({
  item,
  documentNavState
}: {
  item: PortalNewsItem
  documentNavState: ReturnType<typeof makePortalDocumentNavState> | null
}) {
  const {t} = useTranslation()
  const attachment = (item.attachments ?? [])[0]
  const author = item.author_username
    ? ` · ${t("portal.feed_author")}: ${item.author_username}`
    : ""

  return (
    <article className={classes.newsArticle}>
      <h3>{item.title}</h3>
      <div className={classes.meta}>
        {formatApiDateTimeCompact(item.created_at)}
        {author}
      </div>
      {item.body ? (
        <Text className={classes.newsBody} lineClamp={3}>
          {item.body}
        </Text>
      ) : null}
      {attachment ? (
        documentNavState ? (
          <Link
            className={classes.clip}
            to={`/document/${attachment.node_id}`}
            state={documentNavState}
          >
            {drop_extension(attachment.title)}
          </Link>
        ) : (
          <span className={classes.clip}>
            {drop_extension(attachment.title)}
          </span>
        )
      ) : null}
    </article>
  )
}
