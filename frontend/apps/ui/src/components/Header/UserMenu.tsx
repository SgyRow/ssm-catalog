import type {User} from "@/types.ts"
import {Group, Menu, UnstyledButton} from "@mantine/core"
import {displayName} from "@/utils/userDisplay"
import {
  IconChevronRight,
  IconLogout,
  IconUser,
  IconUserCircle
} from "@tabler/icons-react"
import {useSelector} from "react-redux"
import {Link} from "react-router-dom"

import {navigateToLogout} from "@/features/public/guestMode"
import {
  selectCurrentUser,
  selectCurrentUserError,
  selectCurrentUserStatus
} from "@/slices/currentUser.ts"
import {useTranslation} from "react-i18next"

export default function UserMenu() {
  const status = useSelector(selectCurrentUserStatus)
  const error = useSelector(selectCurrentUserError)
  const user = useSelector(selectCurrentUser) as User
  const {t} = useTranslation()

  const onSignOutClicked = () => {
    navigateToLogout()
  }
  if (status == "loading") {
    return <>{t("common.loading")}</>
  }

  if (status == "failed") {
    return <>{error}</>
  }

  return (
    <Menu withArrow>
      <Menu.Target>
        <UnstyledButton>
          <Group>
            <IconUser />
            {displayName(user)}
            <IconChevronRight size="1rem" />{" "}
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          component={Link}
          to="/profile"
          leftSection={<IconUserCircle size={14} />}
        >
          {t("extra.profile")}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconLogout size={14} />}
          onClick={onSignOutClicked}
        >
          {t("extra.logout")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
