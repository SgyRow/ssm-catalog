import {Anchor, Stack, Text} from "@mantine/core"
import {skipToken} from "@reduxjs/toolkit/query"
import {useTranslation} from "react-i18next"
import {Link} from "react-router-dom"

import {useListDocumentMeasuresQuery} from "@/features/msp/mspApiSlice"

/**
 * Measures that link this document. Shown in the "About the file" panel
 * so a normative act can be opened back into the measure it belongs to.
 */
export default function DocumentMeasureLinks({
  documentId
}: {
  documentId?: string
}) {
  const {t} = useTranslation()
  const {data} = useListDocumentMeasuresQuery(documentId ?? skipToken)

  if (!documentId || !data?.length) {
    return null
  }

  return (
    <Stack gap={4} mt="md">
      <Text size="sm" fw={600}>
        {t("msp.normative.used_in")}
      </Text>
      {data.map(item => (
        <Anchor
          key={`${item.msp_id}-${item.folder_title}`}
          component={Link}
          to={`/portal/folder/${item.node_id}`}
          size="sm"
        >
          {item.folder_title
            ? `${item.title} (${item.folder_title})`
            : item.title}
        </Anchor>
      ))}
    </Stack>
  )
}
