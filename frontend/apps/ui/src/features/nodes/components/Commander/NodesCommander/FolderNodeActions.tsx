import {useAppDispatch, useAppSelector} from "@/app/hooks"

import {
  homeFolderTreeToggled,
  selectHomeFolderTreeOpen,
  selectSelectedNodesCount,
  updateActionPanel
} from "@/features/ui/uiSlice"

import {Button, Group, Switch} from "@mantine/core"
import {Link} from "react-router-dom"

import {useViewportSize} from "@mantine/hooks"

import {useTranslation} from "react-i18next"

import {useContext, useEffect, useMemo, useRef, useState} from "react"

import ToggleSecondaryPanel from "@/components/DualPanel/ToggleSecondaryPanel"

import type {PanelMode, SortMenuColumn, SortMenuDirection} from "@/types"

import PanelContext from "@/contexts/PanelContext"

import DuplicatePanelButton from "@/components/DualPanel/DuplicatePanelButton"

import QuickFilter from "@/components/QuickFilter"
import SortMenu from "../SortMenu"
import {filterUpdated} from "@/features/ui/uiSlice"

import DeleteButton from "./DeleteButton"

import EditNodeTagsButton from "./EditNodeTagsButton"

import EditNodeTitleButton from "./EditNodeTitleButton"

import EditNodeVisibilityButton from "./EditNodeVisibilityButton"

import NewFolderButton from "./NewFolderButton"

import MspTemplateButton from "./MspTemplateButton"
import EditFolderCategoriesButton from "@/features/citizen_categories/components/EditFolderCategoriesButton"

import UploadButton from "./UploadButton"

import {
  canAssignNodeTags,
  canCreateFolderInCommander,
  canDeleteInCommander,
  canOpenCommander,
  canReorderInCommander,
  canRenameInCommander,
  canUploadInCommander,
  canUseMspTemplateInCommander,
  NODE_UPDATE,
  type CommanderWriteContext
} from "@/scopes"

import {selectCurrentUser} from "@/slices/currentUser"

type FolderNodeActionsProps = {
  homeFolderTreeAvailable?: boolean
  /** When set, show a link back to the portal catalog view of this folder. */
  portalCatalogFolderId?: string
  commanderWriteContext: CommanderWriteContext
  reorderMode?: boolean
  reorderSaving?: boolean
  onStartReorder?: () => void
  onFinishReorder?: () => void
  onCancelReorder?: () => void
  onApplyReorderSort?: (
    column: SortMenuColumn | undefined,
    direction: SortMenuDirection
  ) => void
}

export default function FolderNodeActions({
  homeFolderTreeAvailable = false,
  portalCatalogFolderId,
  commanderWriteContext,
  reorderMode = false,
  reorderSaving = false,
  onStartReorder,
  onFinishReorder,
  onCancelReorder,
  onApplyReorderSort
}: FolderNodeActionsProps) {
  const {t} = useTranslation()
  const [filterText, selectFilterText] = useState<string>()
  const {height, width} = useViewportSize()
  const dispatch = useAppDispatch()
  const ref = useRef<HTMLDivElement>(null)
  const mode: PanelMode = useContext(PanelContext)
  const selectedCount = useAppSelector(s => selectSelectedNodesCount(s, mode))
  const homeFolderTreeOpen = useAppSelector(selectHomeFolderTreeOpen)
  const user = useAppSelector(selectCurrentUser)
  const scopes = user?.scopes ?? []
  const canUpdateNodes = scopes.includes(NODE_UPDATE)
  const canEditTags = canAssignNodeTags(scopes)
  const canReorder = canReorderInCommander(scopes, commanderWriteContext)

  const writePerms = useMemo(
    () => ({
      upload: canUploadInCommander(scopes, commanderWriteContext),
      createFolder: canCreateFolderInCommander(scopes, commanderWriteContext),
      mspTemplate: canUseMspTemplateInCommander(scopes),
      rename: canRenameInCommander(scopes, commanderWriteContext),
      delete: canDeleteInCommander(scopes, commanderWriteContext)
    }),
    [scopes, commanderWriteContext]
  )

  const onQuickFilterClear = () => {
    selectFilterText(undefined)
    dispatch(filterUpdated({mode, filter: undefined}))
  }

  const onQuickFilterChange = (value: string) => {
    selectFilterText(value)
    dispatch(filterUpdated({mode, filter: value}))
  }

  useEffect(() => {
    if (ref?.current) {
      let value = 0
      const styles = window.getComputedStyle(ref?.current)
      value = parseInt(styles.marginTop)
      value += parseInt(styles.marginBottom)
      value += parseInt(styles.paddingBottom)
      value += parseInt(styles.paddingTop)
      value += parseInt(styles.height)
      dispatch(updateActionPanel({mode, value}))
    }
  }, [width, height, reorderMode])

  return (
    <Group ref={ref} justify="space-between">
      <Group>
        {!reorderMode && writePerms.upload && selectedCount == 0 && (
          <UploadButton />
        )}
        {!reorderMode && writePerms.createFolder && selectedCount == 0 && (
          <NewFolderButton />
        )}
        {!reorderMode && writePerms.mspTemplate && selectedCount == 0 && (
          <MspTemplateButton />
        )}
        {!reorderMode && writePerms.rename && selectedCount == 1 && (
          <EditNodeTitleButton />
        )}
        {!reorderMode &&
          writePerms.rename &&
          selectedCount == 1 &&
          canEditTags && <EditNodeTagsButton />}
        {!reorderMode &&
          writePerms.rename &&
          canUpdateNodes &&
          selectedCount == 1 && <EditNodeVisibilityButton />}
        {!reorderMode && selectedCount == 1 && <EditFolderCategoriesButton />}
        {!reorderMode && writePerms.delete && selectedCount > 0 && (
          <DeleteButton />
        )}
      </Group>
      <Group grow preventGrowOverflow={false} wrap="nowrap">
        {homeFolderTreeAvailable && (
          <Switch
            size="xs"
            label={t("homeFolderTree.show")}
            checked={homeFolderTreeOpen}
            onChange={() => dispatch(homeFolderTreeToggled())}
          />
        )}
        {portalCatalogFolderId ? (
          <Button
            component={Link}
            to={`/portal/folder/${portalCatalogFolderId}`}
            size="xs"
            variant="light"
            disabled={reorderMode}
          >
            {t("portal.browse_in_catalog")}
          </Button>
        ) : null}
        {canReorder &&
          (reorderMode ? (
            <>
              <Button
                size="xs"
                variant="default"
                onClick={onCancelReorder}
                disabled={reorderSaving}
              >
                {t("nodes.reorder.cancel")}
              </Button>
              <Button
                size="xs"
                onClick={onFinishReorder}
                loading={reorderSaving}
              >
                {t("nodes.reorder.done")}
              </Button>
            </>
          ) : (
            <Button size="xs" variant="light" onClick={onStartReorder}>
              {t("nodes.reorder.start")}
            </Button>
          ))}
        <SortMenu
          reorderMode={reorderMode}
          onApplyReorderSort={onApplyReorderSort}
        />
        {!reorderMode && (
          <QuickFilter
            onChange={onQuickFilterChange}
            onClear={onQuickFilterClear}
            filterText={filterText}
          />
        )}
        {canOpenCommander(scopes) && <DuplicatePanelButton />}
        {canOpenCommander(scopes) && <ToggleSecondaryPanel />}
      </Group>
    </Group>
  )
}
