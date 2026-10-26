"""Portal bootstrap defaults.

The portal tree is stored as normal folders/documents owned by the
``legal_portal`` group so they have a stable owner in the node model.
End-user access is **not** tied to membership in that group: readers get in
via the ``portal.view`` permission on their roles (see ``has_node_perm`` in
``papermerge.core.db.common``).
"""

PORTAL_GROUP_NAME = "legal_portal"
PORTAL_ROOT_FOLDER_TITLE = "Home"

# Singleton row in portal_settings
PORTAL_SETTINGS_ROW_ID = 1
