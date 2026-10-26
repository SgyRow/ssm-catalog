import GuideSections from "@/features/help/components/GuideSections"
import classes from "@/features/help/HelpPage.module.css"
import {Anchor, Stack, Text} from "@mantine/core"
import {useRef} from "react"
import {useTranslation} from "react-i18next"

type GuidePanelProps = {
  i18nPrefix: string
  sectionKeys: readonly string[]
  idPrefix: string
}

export default function GuidePanel({
  i18nPrefix,
  sectionKeys,
  idPrefix
}: GuidePanelProps) {
  const {t} = useTranslation()
  const contentRef = useRef<HTMLDivElement>(null)

  const scrollToSection = (key: string) => {
    const container = contentRef.current
    const target = document.getElementById(`${idPrefix}-${key}`)
    if (!container || !target) {
      return
    }
    const top =
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      8
    container.scrollTo({top, behavior: "smooth"})
  }

  return (
    <div className={classes.panel}>
      <nav className={classes.toc} aria-label={t("user_guide.toc")}>
        <Text fw={600} size="sm" mb="xs">
          {t("user_guide.toc")}
        </Text>
        <Stack gap={4}>
          {sectionKeys.map(key => {
            const base = `${i18nPrefix}.${key}`
            return (
              <Anchor
                key={key}
                className={classes.tocLink}
                component="button"
                type="button"
                size="sm"
                onClick={() => scrollToSection(key)}
              >
                {t(`${base}.title`)}
              </Anchor>
            )
          })}
        </Stack>
      </nav>
      <div ref={contentRef} className={classes.content}>
        <GuideSections
          i18nPrefix={i18nPrefix}
          sectionKeys={sectionKeys}
          idPrefix={idPrefix}
        />
      </div>
    </div>
  )
}
