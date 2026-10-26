"""
Permission scopes
"""
from enum import Enum
from typing import Dict, List, Set


class ScopeCategory(Enum):
    """Categories of permission scopes."""
    NODE = "node"
    DOCUMENT = "document"
    TAG = "tag"
    USER = "user"
    GROUP = "group"
    ROLE = "role"
    TASK = "task"
    OCR = "ocr"
    PAGE = "page"
    SHARED_NODE = "shared_node"
    PORTAL = "portal"
    COMMENT = "comment"
    COMMANDER = "commander"


class Action(Enum):
    """Available actions for scopes."""
    CREATE = "create"
    VIEW = "view"
    UPDATE = "update"
    DELETE = "delete"
    MOVE = "move"
    SELECT = "select"
    UPLOAD = "upload"
    DOWNLOAD = "download"
    EXTRACT = "extract"
    # Special actions
    ME = "me"
    OCR = "ocr"
    ALL_VERSIONS = "download.all_versions"
    LAST_VERSION_ONLY = "download.last_version_only"
    UPDATE_TITLE = "update.title"
    UPDATE_TAGS = "update.tags"


class Scopes:
    """Permission scopes"""

    # File manager (commander UI) — browse folders; CRUD still requires node.* / document.* scopes.
    COMMANDER_VIEW = "commander.view"

    # Node permissions
    NODE_CREATE = "node.create"
    NODE_VIEW = "node.view"
    NODE_UPDATE = "node.update"
    NODE_DELETE = "node.delete"
    NODE_MOVE = "node.move"

    # Document permissions
    DOCUMENT_UPLOAD = "document.upload"
    DOCUMENT_DOWNLOAD = "document.download"
    DOCUMENT_DOWNLOAD_ALL_VERSIONS = "document.download.all_versions"
    DOCUMENT_DOWNLOAD_LAST_VERSION_ONLY = "document.download.last_version_only"
    DOCUMENT_UPDATE_TITLE = "document.update.title"
    DOCUMENT_UPDATE_TAGS = "document.update.tags"
    DOCUMENT_FULL_VERSION_VIEW = "document.full_version.view"
    DOCUMENT_FULL_VERSION_MANAGE = "document.full_version.manage"

    # Tag permissions
    TAG_SELECT = "tag.select"  # User can assign existing tags from the catalog
    TAG_CREATE = "tag.create"
    TAG_VIEW = "tag.view"
    TAG_UPDATE = "tag.update"
    TAG_DELETE = "tag.delete"

    # User permissions
    USER_CREATE = "user.create"
    USER_SELECT = "user.select"  # User can pick from dropdown
    USER_VIEW = "user.view"
    USER_UPDATE = "user.update"
    USER_DELETE = "user.delete"
    USER_ME = "user.me"

    # Group permissions
    GROUP_CREATE = "group.create"
    GROUP_SELECT = "group.select"  # User can pick from dropdown
    GROUP_VIEW = "group.view"
    GROUP_UPDATE = "group.update"
    GROUP_DELETE = "group.delete"

    # Role permissions
    ROLE_CREATE = "role.create"
    ROLE_VIEW = "role.view"
    ROLE_SELECT = "role.select"  # User can pick from dropdown
    ROLE_UPDATE = "role.update"
    ROLE_DELETE = "role.delete"

    # Task permissions
    TASK_OCR = "task.ocr"

    # OCR language permissions
    OCRLANG_VIEW = "ocrlang.view"

    # Page permissions
    PAGE_VIEW = "page.view"      # absolete: will be removed in 3.6 (or 3.7)
    PAGE_UPDATE = "page.update"  # absolete: will be removed in 3.6 (or 3.7)
    PAGE_REORDER = "page.reorder"
    PAGE_ROTATE = "page.rotate"
    PAGE_MOVE = "page.move"
    PAGE_EXTRACT = "page.extract"
    PAGE_DELETE = "page.delete"

    # Shared node permissions
    SHARED_NODE_CREATE = "shared_node.create"
    SHARED_NODE_VIEW = "shared_node.view"
    SHARED_NODE_UPDATE = "shared_node.update"
    SHARED_NODE_DELETE = "shared_node.delete"

    # Legal portal (shared catalog under portal_settings.portal_root_node_id)
    PORTAL_VIEW = "portal.view"
    PORTAL_FEED_VIEW = "portal.feed.view"
    PORTAL_FEED_MANAGE = "portal.feed.manage"
    PORTAL_SECTION_CREATE = "portal.section.create"
    PORTAL_SECTION_UPDATE = "portal.section.update"
    PORTAL_SECTION_DELETE = "portal.section.delete"
    PORTAL_DOCUMENT_UPLOAD = "portal.document.upload"
    PORTAL_DOCUMENT_UPDATE = "portal.document.update"
    PORTAL_DOCUMENT_DELETE = "portal.document.delete"

    # Citizen categories (категории граждан) — public folder groupings
    CITIZEN_CATEGORY_VIEW = "citizen_category.view"
    CITIZEN_CATEGORY_CREATE = "citizen_category.create"
    CITIZEN_CATEGORY_UPDATE = "citizen_category.update"
    CITIZEN_CATEGORY_DELETE = "citizen_category.delete"

    # Comment permissions (document library / collaboration).
    # Users may always edit/delete their own comments; update/delete scopes
    # grant moderation over other users' comments.
    COMMENT_CREATE = "comment.create"
    COMMENT_UPDATE = "comment.update"
    COMMENT_DELETE = "comment.delete"

    @classmethod
    def all_scopes(cls) -> Set[str]:
        """Return all available scopes."""
        return {
            value for name, value in cls.__dict__.items()
            if isinstance(value, str) and not name.startswith('_')
        }

    @classmethod
    def get_scopes_by_category(cls, category: str) -> List[str]:
        """Get all scopes for a specific category."""
        return [
            value for name, value in cls.__dict__.items()
            if isinstance(value, str) and value.startswith(f"{category}.")
        ]

    @classmethod
    def get_crud_scopes(cls, category: str) -> Dict[str, str]:
        """Get CRUD scopes for a category."""
        crud_actions = ["create", "view", "update", "delete"]
        result = {}

        for action in crud_actions:
            scope_name = f"{category.upper()}_{action.upper()}"
            if hasattr(cls, scope_name):
                result[action] = getattr(cls, scope_name)

        return result


# Legacy dictionary for backward compatibility
# This maintains the original SCOPES dictionary structure
SCOPES = {scope: scope for scope in Scopes.all_scopes()}

# Export all scope constants at module level for backward compatibility
# This allows imports like: from papermerge.core.features.auth import scopes
# And usage like: scopes.NODE_VIEW, scopes.USER_CREATE, etc.
_scope_attrs = [attr for attr in dir(Scopes) if not attr.startswith('_') and not callable(getattr(Scopes, attr))]
for _attr in _scope_attrs:
    globals()[_attr] = getattr(Scopes, _attr)
