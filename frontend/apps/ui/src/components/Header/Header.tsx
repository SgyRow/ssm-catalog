import {Group, Text, useMantineTheme} from "@mantine/core"

import {ColorSchemeToggle} from "@/components/ColorSchemeToggle/ColorSchemeToggle"
import classes from "./Header.module.css"

import HelpButton from "./HelpButton"
import Search from "./Search"
import SidebarToggle from "./SidebarToggle"
import UserMenu from "./UserMenu"
import NotificationsMenu from "./NotificationsMenu"

const APP_TITLE =
  import.meta.env.VITE_APP_TITLE?.trim() || "Электронная библиотека"

function Header() {
  const theme = useMantineTheme()

  return (
    <header
      className="top-header"
      style={{
        backgroundColor: theme.colors.pmg[9],
        color: theme.colors.pmg[0]
      }}
    >
      <div className={classes.inner}>
        <Group>
          <SidebarToggle />
          <Text fw={600} size="sm" visibleFrom="sm">
            {APP_TITLE}
          </Text>
        </Group>
        <Group grow className={classes.search}>
          <Search />
        </Group>
        <Group>
          <HelpButton />
          <NotificationsMenu />
          <ColorSchemeToggle />
          <UserMenu />
        </Group>
      </div>
    </header>
  )
}

export default Header
