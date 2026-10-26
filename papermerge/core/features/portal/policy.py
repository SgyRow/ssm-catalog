"""Extra permission checks for nodes under the legal portal tree."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import exceptions as exc
from papermerge.core import orm
from papermerge.core import schema
from papermerge.core.features.auth import scopes
from papermerge.core.features.portal.db import api as portal_dbapi


def _has_portal_scope(user: schema.User, scope: str) -> bool:
    if getattr(user, "is_superuser", False):
        return True
    return scope in (user.scopes or [])


async def _under_portal(db_session: AsyncSession, node_id: UUID) -> bool:
    root_id = await portal_dbapi.get_portal_root_id(db_session)
    if root_id is None:
        return False
    return await portal_dbapi.is_node_under_portal_root(
        db_session, node_id, root_id
    )


async def require_portal_view_if_under_portal(
    db_session: AsyncSession, user: schema.User, node_id: UUID
) -> None:
    if not await _under_portal(db_session, node_id):
        return
    if not _has_portal_scope(user, scopes.PORTAL_VIEW):
        raise exc.HTTP403Forbidden()


async def require_portal_on_create(
    db_session: AsyncSession,
    user: schema.User,
    parent_id: UUID,
    *,
    is_folder: bool,
) -> None:
    if not await _under_portal(db_session, parent_id):
        return
    need = (
        scopes.PORTAL_SECTION_CREATE if is_folder else scopes.PORTAL_DOCUMENT_UPLOAD
    )
    if not _has_portal_scope(user, need):
        raise exc.HTTP403Forbidden()


async def require_portal_on_update_node(
    db_session: AsyncSession, user: schema.User, node_id: UUID
) -> None:
    if not await _under_portal(db_session, node_id):
        return
    stmt = select(orm.Node.ctype).where(orm.Node.id == node_id)
    ctype = (await db_session.execute(stmt)).scalar_one_or_none()
    if ctype is None:
        return
    need = (
        scopes.PORTAL_SECTION_UPDATE
        if ctype == "folder"
        else scopes.PORTAL_DOCUMENT_UPDATE
    )
    if not _has_portal_scope(user, need):
        raise exc.HTTP403Forbidden()


async def require_portal_on_reorder(
    db_session: AsyncSession, user: schema.User, parent_id: UUID
) -> None:
    """Rearranging catalog items requires section or document update on the portal."""
    if not await _under_portal(db_session, parent_id):
        return
    if not (
        _has_portal_scope(user, scopes.PORTAL_SECTION_UPDATE)
        or _has_portal_scope(user, scopes.PORTAL_DOCUMENT_UPDATE)
    ):
        raise exc.HTTP403Forbidden()


async def require_portal_on_delete_node(
    db_session: AsyncSession, user: schema.User, node_id: UUID
) -> None:
    if not await _under_portal(db_session, node_id):
        return
    stmt = select(orm.Node.ctype).where(orm.Node.id == node_id)
    ctype = (await db_session.execute(stmt)).scalar_one_or_none()
    if ctype is None:
        return
    need = (
        scopes.PORTAL_SECTION_DELETE
        if ctype == "folder"
        else scopes.PORTAL_DOCUMENT_DELETE
    )
    if not _has_portal_scope(user, need):
        raise exc.HTTP403Forbidden()


async def require_portal_on_move_source(
    db_session: AsyncSession, user: schema.User, source_id: UUID
) -> None:
    if not await _under_portal(db_session, source_id):
        return
    stmt = select(orm.Node.ctype).where(orm.Node.id == source_id)
    ctype = (await db_session.execute(stmt)).scalar_one_or_none()
    if ctype is None:
        return
    need = (
        scopes.PORTAL_SECTION_UPDATE
        if ctype == "folder"
        else scopes.PORTAL_DOCUMENT_UPDATE
    )
    if not _has_portal_scope(user, need):
        raise exc.HTTP403Forbidden()


async def require_portal_on_move_target(
    db_session: AsyncSession, user: schema.User, target_id: UUID
) -> None:
    if not await _under_portal(db_session, target_id):
        return
    if not _has_portal_scope(user, scopes.PORTAL_SECTION_UPDATE):
        raise exc.HTTP403Forbidden()


async def require_portal_on_document_file_upload(
    db_session: AsyncSession, user: schema.User, document_id: UUID
) -> None:
    """Binary upload to an existing document node under the portal."""
    if not await _under_portal(db_session, document_id):
        return
    if not (
        _has_portal_scope(user, scopes.PORTAL_DOCUMENT_UPLOAD)
        or _has_portal_scope(user, scopes.PORTAL_DOCUMENT_UPDATE)
    ):
        raise exc.HTTP403Forbidden()
