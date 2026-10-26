import {useTranslation} from "react-i18next"
import {useEffect, useState} from "react"
import {I18NRoleFormModal} from "kommon"

export default function useI18NText(): I18NRoleFormModal | undefined {
  const {t, i18n} = useTranslation()
  const [txt, setTxt] = useState<I18NRoleFormModal>()
  useEffect(() => {
    if (i18n.isInitialized) {
      setTxt({
        submit: t("common.save"),
        cancel: t("common.cancel"),
        roleForm: {
          name: t("roleForm.name"),
          collapseButton: {
            collapseAll: t("roleForm.collapseButton.collapseAll"),
            expandAll: t("roleForm.collapseButton.expandAll")
          },
          checkButton: {
            checkAll: t("roleForm.checkButton.checkAll"),
            uncheckAll: t("roleForm.checkButton.uncheckAll")
          },
          permissionTree: {
            commander: t("roleForm.permissionTree.commander"),
            folders: t("roleForm.permissionTree.folders"),
            documents: t("roleForm.permissionTree.documents"),
            page_management: t("roleForm.permissionTree.page_management"),
            categories: t("roleForm.permissionTree.categories"),
            shares: t("roleForm.permissionTree.shares"),
            legal_portal: t("roleForm.permissionTree.legal_portal"),
            portal_feed: t("roleForm.permissionTree.portal_feed"),
            portal_feed_manage: t(
              "roleForm.permissionTree.portal_feed_manage"
            ),
            portal_section_create: t(
              "roleForm.permissionTree.portal_section_create"
            ),
            portal_section_update: t(
              "roleForm.permissionTree.portal_section_update"
            ),
            portal_section_delete: t(
              "roleForm.permissionTree.portal_section_delete"
            ),
            portal_document_upload: t(
              "roleForm.permissionTree.portal_document_upload"
            ),
            portal_document_update: t(
              "roleForm.permissionTree.portal_document_update"
            ),
            portal_document_delete: t(
              "roleForm.permissionTree.portal_document_delete"
            ),
            citizen_categories: t("roleForm.permissionTree.citizen_categories"),
            citizen_category_view: t(
              "roleForm.permissionTree.citizen_category_view"
            ),
            citizen_category_create: t(
              "roleForm.permissionTree.citizen_category_create"
            ),
            citizen_category_update: t(
              "roleForm.permissionTree.citizen_category_update"
            ),
            citizen_category_delete: t(
              "roleForm.permissionTree.citizen_category_delete"
            ),
            comments: t("roleForm.permissionTree.comments"),
            comment_moderate_edit: t(
              "roleForm.permissionTree.comment_moderate_edit"
            ),
            comment_moderate_delete: t(
              "roleForm.permissionTree.comment_moderate_delete"
            ),
            users: t("roleForm.permissionTree.users"),
            roles: t("roleForm.permissionTree.roles"),
            groups: t("roleForm.permissionTree.groups"),
            view: t("roleForm.permissionTree.view"),
            create: t("roleForm.permissionTree.create"),
            update: t("roleForm.permissionTree.update"),
            move: t("roleForm.permissionTree.move"),
            delete: t("roleForm.permissionTree.delete"),
            download: t("roleForm.permissionTree.download"),
            upload: t("roleForm.permissionTree.upload"),
            extract: t("roleForm.permissionTree.extract"),
            rotate: t("roleForm.permissionTree.rotate"),
            reorder: t("roleForm.permissionTree.reorder"),
            select: t("roleForm.permissionTree.select"),
            all_versions: t("roleForm.permissionTree.all_versions"),
            only_last_version: t("roleForm.permissionTree.only_last_version"),
            title: t("roleForm.permissionTree.title"),
            custom_fields: t("roleForm.permissionTree.custom_fields"),
            tags: t("roleForm.permissionTree.tags"),
            category: t("roleForm.permissionTree.category"),
            full_version_view: t("roleForm.permissionTree.full_version_view"),
            full_version_manage_perm: t(
              "roleForm.permissionTree.full_version_manage"
            )
          }
        }
      })
    } else {
      setTxt(undefined)
    }
  }, [i18n.isInitialized, t])

  return txt
}
