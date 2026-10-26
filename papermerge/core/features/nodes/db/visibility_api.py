import logging
import uuid
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core.features.nodes.db.visibility_orm import (
    NodeAccessLevel,
    NodeVisibility,
    NodeVisibilityRole,
)
from papermerge.core.features.nodes import schema as nodes_schema
from papermerge.core.features.nodes.visibility import (
    resolve_effective_visibility,
    visibility_summary_from_effective,
    _visibility_role_ids,
)

logger = logging.getLogger(__name__)


async def get_node_visibility_settings(
    db_session: AsyncSession, node_id: UUID
) -> nodes_schema.NodeVisibilitySettings:
    effective = await resolve_effective_visibility(db_session, node_id)
    explicit = await db_session.get(NodeVisibility, node_id)
    inherit = explicit is None
    if inherit:
        return nodes_schema.NodeVisibilitySettings(
            inherit=True,
            access_level=effective.access_level.value,
            role_ids=sorted(effective.role_ids, key=str),
            effective_access_level=effective.access_level.value,
            is_inherited=effective.is_inherited,
        )
    role_ids = list(await _visibility_role_ids(db_session, node_id))
    return nodes_schema.NodeVisibilitySettings(
        inherit=False,
        access_level=explicit.access_level.value,
        role_ids=sorted(role_ids, key=str),
        effective_access_level=effective.access_level.value,
        is_inherited=False,
    )


async def set_node_visibility_settings(
    db_session: AsyncSession,
    node_id: UUID,
    attrs: nodes_schema.UpdateNodeVisibility,
) -> nodes_schema.NodeVisibilitySettings:
    if attrs.inherit:
        await db_session.execute(
            delete(NodeVisibilityRole).where(NodeVisibilityRole.node_id == node_id)
        )
        await db_session.execute(
            delete(NodeVisibility).where(NodeVisibility.node_id == node_id)
        )
        await db_session.commit()
        return await get_node_visibility_settings(db_session, node_id)

    access_level = NodeAccessLevel(attrs.access_level)
    role_ids = list(attrs.role_ids or [])
    if access_level == NodeAccessLevel.role_based and not role_ids:
        raise ValueError("role_ids required for role_based visibility")

    row = await db_session.get(NodeVisibility, node_id)
    if row is None:
        row = NodeVisibility(node_id=node_id, access_level=access_level)
        db_session.add(row)
    else:
        row.access_level = access_level
        await db_session.execute(
            delete(NodeVisibilityRole).where(NodeVisibilityRole.node_id == node_id)
        )

    if access_level == NodeAccessLevel.role_based:
        for rid in role_ids:
            db_session.add(NodeVisibilityRole(node_id=node_id, role_id=rid))

    await db_session.commit()
    return await get_node_visibility_settings(db_session, node_id)


async def visibility_summary_for_node(
    db_session: AsyncSession, node_id: UUID
) -> str:
    effective = await resolve_effective_visibility(db_session, node_id)
    return visibility_summary_from_effective(effective)
