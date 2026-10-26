import GuidePanel from "@/features/help/components/GuidePanel"
import {canViewAdminGuide} from "@/features/help/canViewAdminGuide"
import classes from "@/features/help/HelpPage.module.css"
import {
  ADMIN_GUIDE_SECTION_KEYS,
  USER_GUIDE_SECTION_KEYS
} from "@/features/help/sectionKeys"
import {
  selectCurrentUser,
  selectCurrentUserStatus
} from "@/slices/currentUser"
import type {UserDetails} from "@/types"
import {Loader, Stack, Tabs, Title} from "@mantine/core"
import {useTranslation} from "react-i18next"
import {useSelector} from "react-redux"

export default function UserGuidePage() {
  const {t} = useTranslation()
  const status = useSelector(selectCurrentUserStatus)
  const user = useSelector(selectCurrentUser) as UserDetails | null

  if (status === "loading" || status === "idle") {
    return (
      <Stack className={classes.page} align="center" justify="center">
        <Loader />
      </Stack>
    )
  }

  const showAdminGuide = status === "succeeded" && canViewAdminGuide(user)

  if (!showAdminGuide) {
    return (
      <div className={classes.page}>
        <Title className={classes.pageHeader} order={3}>
          {t("user_guide.tab_user")}
        </Title>
        <div className={classes.pageBody}>
          <GuidePanel
            i18nPrefix="user_guide.user.sections"
            sectionKeys={USER_GUIDE_SECTION_KEYS}
            idPrefix="help-user"
          />
        </div>
      </div>
    )
  }

  return (
    <div className={classes.page}>
      <Title className={classes.pageHeader} order={3}>
        {t("user_guide.title")}
      </Title>
      <div className={classes.pageBody}>
        <Tabs
          classNames={{root: classes.tabsRoot, panel: classes.tabsPanel}}
          defaultValue="user"
        >
          <Tabs.List>
            <Tabs.Tab value="user">{t("user_guide.tab_user")}</Tabs.Tab>
            <Tabs.Tab value="admin">{t("user_guide.tab_admin")}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="user">
            <GuidePanel
              i18nPrefix="user_guide.user.sections"
              sectionKeys={USER_GUIDE_SECTION_KEYS}
              idPrefix="help-user"
            />
          </Tabs.Panel>

          <Tabs.Panel value="admin">
            <GuidePanel
              i18nPrefix="user_guide.admin.sections"
              sectionKeys={ADMIN_GUIDE_SECTION_KEYS}
              idPrefix="help-admin"
            />
          </Tabs.Panel>
        </Tabs>
      </div>
    </div>
  )
}
