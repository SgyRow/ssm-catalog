import {useAppSelector} from "@/app/hooks"
import {ActionIcon, Group, Skeleton, Stack, TagsInput} from "@mantine/core"
import {useDisclosure} from "@mantine/hooks"
import {useContext} from "react"
import {useTranslation} from "react-i18next"

import PanelContext from "@/contexts/PanelContext"
import {useGetDocumentQuery} from "@/features/document/store/apiSlice"
import {skipToken} from "@reduxjs/toolkit/query"
import {IconEdit} from "@tabler/icons-react"
import classes from "./DocumentDetails.module.css"

import {EditNodeTagsModal} from "@/components/EditNodeTags"
import type {DocumentType} from "@/features/document/types"
import {canAssignNodeTags} from "@/scopes"
import {selectCurrentUser} from "@/slices/currentUser"
import {
  selectCurrentNodeID,
  selectDocumentDetailsPanelOpen
} from "@/features/ui/uiSlice"
import type {PanelMode} from "@/types"
import DocumentLibraryPanel from "@/features/library/components/DocumentLibraryPanel"
import DocumentFullVersionField from "@/features/document/components/DocumentFullVersionField"

interface Args {
  doc?: DocumentType
  docID?: string
  isLoading: boolean
}

export default function DocumentDetails({doc, docID, isLoading}: Args) {
  const {t} = useTranslation()

  const mode: PanelMode = useContext(PanelContext)
  const documentDetailsIsOpen = useAppSelector(s =>
    selectDocumentDetailsPanelOpen(s, mode)
  )

  if (!docID || isLoading) {
    return (
      <Group align="flex-start" className={classes.documentDetailsOpened}>
        <Stack className={classes.documentDetailsContent} justify="flex-start">
          <Skeleton height={"20"} />
          <Skeleton height={"20"} />
          <Skeleton height={"20"} />
        </Stack>
      </Group>
    )
  }

  if (documentDetailsIsOpen) {
    return (
      <Group align="flex-start" className={classes.documentDetailsOpened}>
        <Stack className={classes.documentDetailsContent} justify="flex-start">
          <Group>
            <TagsInput
              rightSection={<EditTagsButton doc={doc} />}
              label={t("common.tags")}
              readOnly
              value={doc?.tags?.map(t => t.name) || []}
              mt="md"
            />
          </Group>
          {docID ? <DocumentFullVersionField documentId={docID} /> : null}
          {docID ? <DocumentLibraryPanel documentId={docID} /> : null}
        </Stack>
      </Group>
    )
  }

  return <></>
}

function EditTagsButton({doc}: {doc?: DocumentType}) {
  const [opened, {open, close}] = useDisclosure(false)
  const mode: PanelMode = useContext(PanelContext)
  const docID = useAppSelector(s => selectCurrentNodeID(s, mode))
  const user = useAppSelector(selectCurrentUser)
  const scopes = user?.scopes ?? []
  const canEdit = canAssignNodeTags(scopes)
  const {currentData: liveDoc} = useGetDocumentQuery(docID ?? skipToken)
  const node = liveDoc ?? doc

  if (!canEdit) {
    return null
  }

  const onClick = () => {
    open()
  }

  const onSubmit = () => {
    close()
  }

  const onCancel = () => {
    close()
  }

  return (
    <>
      <ActionIcon variant="default" onClick={onClick}>
        <IconEdit stroke={1.4} />
      </ActionIcon>
      {node && (
        <EditNodeTagsModal
          opened={opened}
          node={node}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )}
    </>
  )
}
