import {useAppSelector} from "@/app/hooks"
import {Button, Group, Loader, Modal, MultiSelect} from "@mantine/core"
import {useEffect, useMemo, useState} from "react"

import Error from "@/components/Error"
import {
  useGetNodeTagsQuery,
  useUpdateNodeTagsMutation
} from "@/features/nodes/apiSlice"
import {useGetTagsQuery} from "@/features/tags/apiSlice"
import {canAssignNodeTags, canSelectTags} from "@/scopes"
import {selectCurrentUser} from "@/slices/currentUser"
import type {EntityWithTags} from "@/types"
import {useTranslation} from "react-i18next"

interface Args {
  node: EntityWithTags
  opened: boolean
  onSubmit: () => void
  onCancel: () => void
}

export const EditNodeTagsModal = ({node, onSubmit, onCancel, opened}: Args) => {
  const {t} = useTranslation()
  const user = useAppSelector(selectCurrentUser)
  const scopes = user?.scopes ?? []
  const canEdit = canAssignNodeTags(scopes)
  const canListCatalog = canSelectTags(scopes)

  const {data, isLoading: isLoadingTags} = useGetNodeTagsQuery(node.id)
  const [updateNodeTags, {isLoading, isSuccess}] = useUpdateNodeTagsMutation()
  const {
    data: allTagsData,
    isLoading: isLoadingAllTagsData,
    isError: isCatalogError
  } = useGetTagsQuery(undefined, {skip: !canListCatalog})
  const [tags, setTags] = useState<string[]>(node.tags.map(t => t.name))
  const [error, setError] = useState("")

  const catalogOptions = useMemo(() => {
    const names = new Set<string>()
    for (const tag of allTagsData ?? []) {
      names.add(tag.name)
    }
    for (const tag of data ?? []) {
      names.add(tag.name)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [allTagsData, data])

  useEffect(() => {
    if (isSuccess) {
      onSubmit()
    }
  }, [isSuccess, onSubmit])

  useEffect(() => {
    if (data) {
      setTags(data.map(t => t.name))
    }
  }, [data, isLoadingTags])

  const onLocalSubmit = async () => {
    if (!canEdit) {
      setError(t("pages.error.access_forbidden.message"))
      return
    }

    const allowed = new Set(catalogOptions.map(name => name.toLowerCase()))
    const invalid = tags.filter(name => !allowed.has(name.toLowerCase()))
    if (invalid.length > 0) {
      setError(t("edit_tags.unknown_tags", {names: invalid.join(", ")}))
      return
    }

    try {
      await updateNodeTags({id: node.id, tags}).unwrap()
    } catch (err: unknown) {
      const detail = (err as {data?: {detail?: unknown}})?.data?.detail
      setError(
        typeof detail === "string"
          ? detail
          : detail
            ? JSON.stringify(detail)
            : String(err)
      )
    }
  }

  const onLocalCancel = () => {
    onCancel()
    setError("")
  }

  const catalogLoading = isLoadingAllTagsData || isLoadingTags
  const formDisabled = !canEdit || catalogLoading || !canListCatalog
  const catalogError = isCatalogError
    ? t("pages.error.access_forbidden.message")
    : ""

  return (
    <Modal title={t("edit_tags.title")} opened={opened} onClose={onLocalCancel}>
      <MultiSelect
        data-autofocus
        onChange={setTags}
        value={tags}
        label={t("tags.name")}
        description={t("edit_tags.catalog_only")}
        data={catalogOptions}
        searchable
        clearable
        nothingFoundMessage={t("edit_tags.catalog_empty")}
        disabled={formDisabled}
        mt="md"
      />
      {(catalogError || error) && <Error message={catalogError || error} />}
      <Group justify="space-between" mt="md">
        <Button variant="default" onClick={onLocalCancel}>
          {t("common.cancel")}
        </Button>
        <Group>
          {(isLoading || catalogLoading) && <Loader size="sm" />}
          <Button disabled={formDisabled || isLoading} onClick={onLocalSubmit}>
            {t("common.submit")}
          </Button>
        </Group>
      </Group>
    </Modal>
  )
}
