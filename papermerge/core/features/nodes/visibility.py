"""Node visibility resolution and access checks for guest / role-based browsing."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from papermerge.core.features.nodes.db import orm as nodes_orm
from papermerge.core.features.nodes.db.visibility_orm import (
    NodeAccessLevel,
    NodeVisibility,
    NodeVisibilityRole,
)
from papermerge.core.features.roles.db.orm import users_roles_association
from papermerge.core.db.common import get_ancestors


@dataclass(frozen=True)
class EffectiveVisibility:
    access_level: NodeAccessLevel
    role_ids: frozenset[UUID]
    is_inherited: bool
    explicit_node_id: UUID | None


async def _is_superuser(db_session: AsyncSession, user_id: UUID) -> bool:
    from papermerge.core.features.users.db.orm import User

    return bool(
        await db_session.scalar(
            select(User.is_superuser).where(User.id == user_id)
        )
    )


async def _visibility_role_ids(
    db_session: AsyncSession, node_id: UUID
) -> frozenset[UUID]:
    rows = await db_session.scalars(
        select(NodeVisibilityRole.role_id).where(
            NodeVisibilityRole.node_id == node_id
        )
    )
    return frozenset(rows.all())


async def get_explicit_visibility(
    db_session: AsyncSession, node_id: UUID
) -> NodeVisibility | None:
    stmt = select(NodeVisibility).where(NodeVisibility.node_id == node_id)
    return (await db_session.scalars(stmt)).one_or_none()


async def resolve_effective_visibility(
    db_session: AsyncSession, node_id: UUID
) -> EffectiveVisibility:
    """Nearest explicit override on self or ancestors; default private."""
    chain = await get_ancestors(db_session, node_id, include_self=True)
    for nid, _title in reversed(chain):
        row = await get_explicit_visibility(db_session, nid)
        if row is not None:
            role_ids = await _visibility_role_ids(db_session, nid)
            return EffectiveVisibility(
                access_level=row.access_level,
                role_ids=role_ids,
                is_inherited=(nid != node_id),
                explicit_node_id=nid,
            )
    return EffectiveVisibility(
        access_level=NodeAccessLevel.private,
        role_ids=frozenset(),
        is_inherited=True,
        explicit_node_id=None,
    )


async def _user_role_ids(db_session: AsyncSession, user_id: UUID) -> set[UUID]:
    rows = await db_session.execute(
        select(users_roles_association.c.role_id).where(
            users_roles_association.c.user_id == user_id
        )
    )
    return {row.role_id for row in rows}


def _visibility_allows_viewer(
    effective: EffectiveVisibility,
    user_id: UUID | None,
    user_role_ids: set[UUID],
) -> bool:
    if effective.access_level == NodeAccessLevel.public:
        return True
    if effective.access_level == NodeAccessLevel.private:
        return False
    if user_id is None:
        return False
    if not effective.role_ids:
        return False
    return bool(user_role_ids & set(effective.role_ids))


async def can_view_node(
    db_session: AsyncSession,
    node_id: UUID,
    user_id: UUID | None,
) -> bool:
    """True when the viewer may see `node_id` (ownership, superuser, or visibility)."""
    node = await db_session.scalar(
        select(nodes_orm.Node).where(
            nodes_orm.Node.id == node_id,
            nodes_orm.Node.deleted_at.is_(None),
        )
    )
    if node is None:
        return False

    if user_id is not None:
        if await _is_superuser(db_session, user_id):
            return True
        # Personal home tree only — group membership does not bypass visibility.
        if node.user_id == user_id:
            return True
        from papermerge.core.db.common import _user_has_any_portal_perm_via_account_roles
        from papermerge.core.features.auth import scopes as auth_scopes
        from papermerge.core.features.portal.db import api as portal_dbapi

        portal_root = await portal_dbapi.get_portal_root_id(db_session)
        if portal_root is not None and node_id == portal_root:
            if await _user_has_any_portal_perm_via_account_roles(
                db_session, user_id, auth_scopes.PORTAL_VIEW
            ):
                return True

    if user_id is None:
        from papermerge.core.features.library_ts.db import (
            settings_api as library_settings_api,
        )

        catalog_root = await library_settings_api.get_catalog_root_id(db_session)
        if catalog_root is not None and node_id == catalog_root:
            return True

    user_roles: set[UUID] = set()
    if user_id is not None:
        user_roles = await _user_role_ids(db_session, user_id)

    effective = await resolve_effective_visibility(db_session, node_id)
    return _visibility_allows_viewer(effective, user_id, user_roles)


def visibility_summary_from_effective(effective: EffectiveVisibility) -> str:
    if effective.access_level == NodeAccessLevel.public:
        return "public"
    if effective.access_level == NodeAccessLevel.role_based:
        return "role_based"
    return "private"
