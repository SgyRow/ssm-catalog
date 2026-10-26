import {useRenameFolderMutation} from "@/features/nodes/apiSlice"
import {
  buildFileNameWithOriginalExtension,
  isAcceptableUploadStem
} from "@/features/document/documentPreview"
import type {EditEntityTitle} from "@/types"
import type {I18NEditNodeTitleModal} from "kommon"
import {EditNodeTitleModal} from "kommon"
import {ChangeEvent, useEffect, useState} from "react"

import {drop_extension} from "@/utils"
import {useTranslation} from "react-i18next"
import {useEnterSubmit} from "./useEnterSubmit"

interface Args {
  node: EditEntityTitle
  opened: boolean
  onSubmit: () => void
  onCancel: () => void
}

export const EditNodeTitleModalContainer = ({
  node,
  onSubmit,
  onCancel,
  opened
}: Args) => {
  const {t} = useTranslation()
  const txt = useI18nText()
  const [renameFolder, {isLoading}] = useRenameFolderMutation()
  const isDocument = node.ctype === "document"
  const [title, setTitle] = useState(
    isDocument ? drop_extension(node.title) : node.title
  )
  const [error, setError] = useState("")

  useEffect(() => {
    if (opened) {
      setTitle(isDocument ? drop_extension(node.title) : node.title)
    }
  }, [opened, node.id, node.title, isDocument])

  const handleTitleChanged = (event: ChangeEvent<HTMLInputElement>) => {
    let value = event.currentTarget.value
    setTitle(value)
  }

  const onLocalSubmit = async () => {
    const finalTitle = isDocument
      ? buildFileNameWithOriginalExtension(node.title, title)
      : title

    if (
      isDocument &&
      !isAcceptableUploadStem(node.title, title)
    ) {
      setError(t("common.generic_error"))
      return
    }

    const data = {
      title: finalTitle,
      id: node.id
    }

    try {
      await renameFolder(data)
      onSubmit()
      reset() // sets error message back to empty string
    } catch (error: any) {
      setError(error?.data?.detail ?? t("common.generic_error"))
    }
  }

  useEnterSubmit(onLocalSubmit)

  const onLocalCancel = () => {
    onCancel()
    reset()
  }

  const reset = () => {
    setError("")
  }

  return (
    <EditNodeTitleModal
      inProgress={isLoading}
      onCancel={onLocalCancel}
      onSubmit={onLocalSubmit}
      onTitleChange={handleTitleChanged}
      value={title}
      error={error}
      opened={opened}
      txt={txt}
    />
  )
}

function useI18nText(): I18NEditNodeTitleModal | undefined {
  const {t, i18n} = useTranslation()
  const [txt, setTxt] = useState<I18NEditNodeTitleModal>()

  useEffect(() => {
    if (i18n.isInitialized) {
      setTxt({
        editTitle: t("editNodeTitleModal.title"),
        newTitleLabel: t("editNodeTitleModal.newTitleLabel"),
        placeholder: t("editNodeTitleModal.placeholder"),
        cancel: t("common.cancel"),
        submit: t("common.submit")
      })
    } else {
      setTxt(undefined)
    }
  }, [i18n.isInitialized, t])

  return txt
}

export default EditNodeTitleModalContainer
