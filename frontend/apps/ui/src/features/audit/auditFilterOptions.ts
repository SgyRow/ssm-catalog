export const AUDIT_ACTION_GROUPS: {groupKey: string; actions: string[]}[] = [
  {
    groupKey: "nodes",
    actions: [
      "node_create",
      "node_update",
      "node_move",
      "node_soft_delete",
      "node_hard_delete",
      "node_restore",
      "node_purge",
      "node_tags_set",
      "node_tags_append",
      "node_tags_remove",
      "node_visibility_update",
      "portal_node_create",
      "portal_node_update",
      "portal_node_move",
      "msp_template_create"
    ]
  },
  {
    groupKey: "documents",
    actions: [
      "document_view",
      "document_download",
      "document_upload",
      "portal_document_upload",
      "document_custom_fields_update",
      "document_type_update",
      "pages_update",
      "pages_move",
      "pages_extract",
      "full_version_update",
      "favorite_add",
      "favorite_remove",
      "favorite_move",
      "favorite_folder_create",
      "favorite_folder_delete",
      "watched_add",
      "watched_remove",
      "watched_move",
      "watched_folder_create",
      "watched_folder_delete",
      "note_upsert",
      "comment_add",
      "comment_update",
      "comment_delete",
      "rating_set"
    ]
  },
  {
    groupKey: "auth",
    actions: ["auth_login", "auth_logout"]
  },
  {
    groupKey: "accounts",
    actions: [
      "user_create",
      "user_update",
      "user_profile_update",
      "user_delete",
      "user_password_change",
      "role_create",
      "role_update",
      "role_delete",
      "group_create",
      "group_update",
      "group_delete"
    ]
  },
  {
    groupKey: "catalog",
    actions: [
      "tag_create",
      "tag_update",
      "tag_delete",
      "document_type_create",
      "document_type_delete",
      "custom_field_create",
      "custom_field_update",
      "custom_field_delete",
      "citizen_category_create",
      "citizen_category_update",
      "citizen_category_delete",
      "citizen_category_folder_set"
    ]
  },
  {
    groupKey: "portal",
    actions: [
      "portal_feed_create",
      "portal_feed_update",
      "portal_feed_delete",
      "service_create",
      "service_delete"
    ]
  },
  {
    groupKey: "search",
    actions: ["search_query"]
  }
]

export const AUDIT_RESOURCE_TYPES = [
  "node",
  "folder",
  "document",
  "user",
  "role",
  "group",
  "tag",
  "document_type",
  "custom_field",
  "citizen_category",
  "portal_news",
  "session",
  "search",
  "service"
]
