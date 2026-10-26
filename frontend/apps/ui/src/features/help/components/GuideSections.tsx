import classes from "@/features/help/HelpPage.module.css"
import {List, Paper, Stack, Text, Title} from "@mantine/core"
import {useTranslation} from "react-i18next"

type GuideSectionsProps = {
  i18nPrefix: string
  sectionKeys: readonly string[]
  idPrefix: string
}

export default function GuideSections({
  i18nPrefix,
  sectionKeys,
  idPrefix
}: GuideSectionsProps) {
  const {t} = useTranslation()

  return (
    <Stack gap="lg">
      {sectionKeys.map(key => {
        const base = `${i18nPrefix}.${key}`
        const rawItems = t(`${base}.items`, {returnObjects: true})
        const items = Array.isArray(rawItems)
          ? rawItems.filter((item): item is string => typeof item === "string")
          : []

        return (
          <Paper
            key={key}
            id={`${idPrefix}-${key}`}
            className={classes.section}
            withBorder
            p="md"
          >
            <Stack gap="sm">
              <Title order={4}>{t(`${base}.title`)}</Title>
              <List spacing="xs" withPadding>
                {items.map((item, index) => (
                  <List.Item key={index}>
                    <Text className={classes.itemText} component="span">
                      {item}
                    </Text>
                  </List.Item>
                ))}
              </List>
            </Stack>
          </Paper>
        )
      })}
    </Stack>
  )
}
