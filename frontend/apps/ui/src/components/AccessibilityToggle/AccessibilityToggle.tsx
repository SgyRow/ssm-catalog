import {Switch, Tooltip, rem, useMantineTheme} from "@mantine/core"
import {IconAccessible, IconAccessibleOff} from "@tabler/icons-react"
import {useTranslation} from "react-i18next"

import {useAccessibility} from "@/accessibility/AccessibilityContext"

export function AccessibilityToggle() {
  const {t} = useTranslation()
  const theme = useMantineTheme()
  const {enabled, setEnabled} = useAccessibility()

  const onIcon = (
    <IconAccessible
      style={{width: rem(18), height: rem(18)}}
      stroke={2.5}
      color={theme.colors.blue[7]}
      aria-hidden
    />
  )

  const offIcon = (
    <IconAccessibleOff
      style={{width: rem(18), height: rem(18)}}
      stroke={2.5}
      color={theme.colors.gray[5]}
      aria-hidden
    />
  )

  return (
    <Tooltip
      label={
        enabled
          ? t("accessibility.toggle.disable")
          : t("accessibility.toggle.enable")
      }
      withArrow
    >
      <Switch
        checked={enabled}
        onChange={event => setEnabled(event.currentTarget.checked)}
        color="blue.7"
        onLabel={onIcon}
        offLabel={offIcon}
        aria-label={t("accessibility.toggle.label")}
      />
    </Tooltip>
  )
}
