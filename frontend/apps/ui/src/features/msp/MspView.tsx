import {downloadMspPdf, type Msp} from "@/features/msp/mspApiSlice"
import {
  Button,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text
} from "@mantine/core"
import {notifications} from "@mantine/notifications"
import {IconDownload} from "@tabler/icons-react"
import {useCallback, useState} from "react"
import {useTranslation} from "react-i18next"

/**
 * Document-like rendering of a measure: each filled section is shown as a
 * titled block of paragraphs, the way a real МСП document would look on the
 * site. A button renders/downloads the whole measure as a PDF.
 */
export default function MspView({msp}: {msp: Msp}) {
  const {t} = useTranslation()
  const [downloading, setDownloading] = useState(false)

  const onDownload = useCallback(async () => {
    setDownloading(true)
    try {
      await downloadMspPdf(msp.id, msp.title)
    } catch (error) {
      notifications.show({
        title: t("msp.view.pdf_error"),
        message:
          error instanceof Error && error.message
            ? error.message
            : "",
        color: "red"
      })
    } finally {
      setDownloading(false)
    }
  }, [msp.id, msp.title, t])

  return (
    <Stack gap="md" mt="md">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <div style={{minWidth: 0}}>
          <Text size="lg" fw={700}>
            {msp.title}
          </Text>
          {msp.msp_type_name ? (
            <Text size="sm" c="dimmed">
              {msp.msp_type_name}
            </Text>
          ) : null}
        </div>
        <Button
          variant="light"
          leftSection={<IconDownload size={16} />}
          onClick={onDownload}
          loading={downloading}
        >
          {t("msp.view.download_pdf")}
        </Button>
      </Group>

      {msp.sections.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t("msp.view.empty")}
        </Text>
      ) : (
        <Stack gap="sm">
          {msp.sections.map(section => (
            <Paper key={section.id} withBorder p="md" radius="md">
              <Text size="md" fw={600} mb="xs">
                {section.title}
              </Text>
              {renderBody(section.body ?? "")}
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  )
}

/** Render a body as one or more paragraphs, like a document. */
function renderBody(body: string) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
  if (paragraphs.length === 0) {
    return null
  }
  return (
    <Stack gap="xs">
      {paragraphs.map((paragraph, idx) => (
        <Text
          key={idx}
          size="sm"
          lh={1.6}
          style={{whiteSpace: "pre-line"}}
        >
          {paragraph}
        </Text>
      ))}
    </Stack>
  )
}

export function MspViewSkeleton() {
  return (
    <Stack gap="sm" mt="md">
      <Skeleton height={28} width="60%" />
      <Skeleton height={80} />
      <Skeleton height={80} />
    </Stack>
  )
}
