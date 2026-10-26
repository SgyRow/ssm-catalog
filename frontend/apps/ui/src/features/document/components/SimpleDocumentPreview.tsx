import {Button, Group, Loader, Stack, Text, Title} from "@mantine/core"
import {IconDownload} from "@tabler/icons-react"
import {useTranslation} from "react-i18next"

import PublicBreadcrumbs from "@/features/public/components/PublicBreadcrumbs"
import PublicDocumentPreviewBody from "@/features/public/components/PublicDocumentPreviewBody"
import type {BreadcrumbType} from "@/types"

type Props = {
  trail: BreadcrumbType
  title: string
  previewUrl: string | null
  downloadUrl: string | null
  fileName?: string | null
  folderHref?: (folderId: string) => string
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
}

export default function SimpleDocumentPreview({
  trail,
  title,
  previewUrl,
  downloadUrl,
  fileName,
  folderHref,
  isLoading = false,
  isError = false,
  errorMessage
}: Props) {
  const {t} = useTranslation()

  if (isLoading) {
    return <Loader p="md" />
  }

  if (isError || !previewUrl || !downloadUrl) {
    return (
      <Text p="md" c="dimmed">
        {errorMessage ?? t("public.browse.forbidden")}
      </Text>
    )
  }

  return (
    <Stack gap="md" p="md">
      <PublicBreadcrumbs trail={trail} folderHref={folderHref} />
      <Group justify="space-between" align="flex-start">
        <Title order={4}>{title}</Title>
        <Button
          component="a"
          href={downloadUrl}
          leftSection={<IconDownload size={16} />}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("public.document.download")}
        </Button>
      </Group>
      {fileName ? (
        <PublicDocumentPreviewBody downloadUrl={previewUrl} fileName={fileName} />
      ) : (
        <iframe
          title={t("public.document.preview")}
          src={previewUrl}
          style={{width: "100%", height: "75vh", border: "1px solid #ccc"}}
        />
      )}
    </Stack>
  )
}