import {
  Switch,
  useComputedColorScheme,
  useMantineColorScheme,
  useMantineTheme,
  rem
} from "@mantine/core"
import {IconSun, IconMoonStars} from "@tabler/icons-react"

export function ColorSchemeToggle() {
  const theme = useMantineTheme()
  const {toggleColorScheme} = useMantineColorScheme()
  const computedColorScheme = useComputedColorScheme("light")

  const sunIcon = (
    <IconSun
      style={{width: rem(16), height: rem(16)}}
      stroke={2.5}
      color={theme.colors.yellow[4]}
    />
  )

  const moonIcon = (
    <IconMoonStars
      style={{width: rem(16), height: rem(16)}}
      stroke={2.5}
      color={theme.colors.pmg[9]}
    />
  )

  return (
    <Switch
      checked={computedColorScheme === "light"}
      onChange={() => toggleColorScheme()}
      color="dark.4"
      onLabel={sunIcon}
      offLabel={moonIcon}
    />
  )
}
