import logging
import uuid
from uuid import UUID

from sqlalchemy import delete, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import orm
from papermerge.core import constants as core_constants
from papermerge.core.db import common as dbapi_common
from papermerge.core.db.common import get_ancestors, get_descendants
from papermerge.core.features.auth import scopes
from papermerge.core.features.groups.db import api as groups_dbapi
from papermerge.core.features.portal.constants import (
    PORTAL_GROUP_NAME,
    PORTAL_ROOT_FOLDER_TITLE,
    PORTAL_SETTINGS_ROW_ID,
)
from papermerge.core.features.portal.db import orm as portal_orm
from papermerge.core.features.users.schema import user_display_name

logger = logging.getLogger(__name__)

MAX_PORTAL_NEWS_ATTACHMENTS = 30


def _author_label(
    username: str | None, first_name: str | None, last_name: str | None
) -> str:
    if not username:
        return ""
    return user_display_name(first_name, last_name, username)


async def _author_label_by_id(db_session: AsyncSession, user_id: UUID | None) -> str:
    if user_id is None:
        return ""
    row = (
        await db_session.execute(
            select(orm.User.username, orm.User.first_name, orm.User.last_name).where(
                orm.User.id == user_id
            )
        )
    ).one_or_none()
    if row is None:
        return ""
    return _author_label(row[0], row[1], row[2])


async def get_portal_settings_row(
    db_session: AsyncSession,
) -> portal_orm.PortalSettings | None:
    stmt = select(portal_orm.PortalSettings).where(
        portal_orm.PortalSettings.id == PORTAL_SETTINGS_ROW_ID
    )
    return (await db_session.scalars(stmt)).one_or_none()


async def get_portal_root_id(db_session: AsyncSession) -> UUID | None:
    row = await get_portal_settings_row(db_session)
    if row is None:
        return None
    return row.portal_root_node_id


async def get_portal_group_id(db_session: AsyncSession) -> UUID | None:
    row = await get_portal_settings_row(db_session)
    if row is None:
        return None
    return row.portal_group_id


async def is_node_under_portal_root(
    db_session: AsyncSession, node_id: UUID, root_id: UUID | None
) -> bool:
    if root_id is None:
        return False
    chain = await get_ancestors(db_session, node_id, include_self=True)
    ids = {row[0] for row in chain}
    return root_id in ids


async def get_portal_subtree_node_ids(
    db_session: AsyncSession, root_id: UUID | None
) -> set[UUID]:
    if root_id is None:
        return set()
    rows = await get_descendants(db_session, [root_id], include_selfs=True)
    return {r[0] for r in rows}


async def ensure_portal_bootstrap(
    db_session: AsyncSession,
) -> tuple[UUID | None, UUID | None, str | None]:
    """Create portal group + root folder + settings row if missing. Idempotent."""
    row = await get_portal_settings_row(db_session)
    if row and row.portal_root_node_id:
        group_id = row.portal_group_id
        if group_id is None:
            group_id = await db_session.scalar(
                select(orm.Node.group_id).where(orm.Node.id == row.portal_root_node_id)
            )
            if group_id is not None:
                row.portal_group_id = group_id
        await db_session.commit()
        return row.portal_root_node_id, row.portal_group_id or group_id, None

    group = await groups_dbapi.create_group(
        db_session,
        PORTAL_GROUP_NAME,
        with_special_folders=False,
        exists_ok=True,
    )
    group_uuid = group.id

    root_id = uuid.uuid4()
    root_folder = orm.Folder(
        id=root_id,
        title=PORTAL_ROOT_FOLDER_TITLE,
        ctype=core_constants.CTYPE_FOLDER,
        group_id=group_uuid,
        user_id=None,
        parent_id=None,
        lang="xxx",
    )
    db_session.add(root_folder)

    if row is None:
        db_session.add(
            portal_orm.PortalSettings(
                id=PORTAL_SETTINGS_ROW_ID,
                portal_root_node_id=root_id,
                portal_group_id=group_uuid,
            )
        )
    else:
        row.portal_root_node_id = root_id
        row.portal_group_id = group_uuid

    await db_session.commit()
    logger.info(
        "Portal bootstrap: root_folder_id=%s group_id=%s", root_id, group_uuid
    )
    return root_id, group_uuid, None


async def validate_portal_news_attachment_nodes(
    db_session: AsyncSession,
    user_id: UUID,
    node_ids: list[UUID],
) -> list[UUID]:
    """Return ordered unique node ids, or raise ValueError with a machine reason."""
    if len(node_ids) > MAX_PORTAL_NEWS_ATTACHMENTS:
        raise ValueError("too_many_attachments")
    root_id = await get_portal_root_id(db_session)
    if root_id is None:
        raise ValueError("portal_not_configured")
    subtree = await get_portal_subtree_node_ids(db_session, root_id)
    seen: set[UUID] = set()
    ordered: list[UUID] = []
    for nid in node_ids:
        if nid in seen:
            continue
        seen.add(nid)
        ordered.append(nid)
    for nid in ordered:
        if nid not in subtree:
            raise ValueError("attachment_not_in_portal")
        node = await db_session.scalar(select(orm.Node).where(orm.Node.id == nid))
        if node is None:
            raise ValueError("attachment_node_missing")
        if node.ctype != core_constants.CTYPE_DOCUMENT:
            raise ValueError("attachment_not_document")
        await dbapi_common.require_node_perm(
            db_session,
            node_id=nid,
            codename=scopes.NODE_VIEW,
            user_id=user_id,
        )
    return ordered


async def _attachments_by_news_ids(
    db_session: AsyncSession, news_ids: list[UUID]
) -> dict[UUID, list[dict]]:
    if not news_ids:
        return {}
    stmt = (
        select(
            portal_orm.PortalNewsAttachment.news_id,
            portal_orm.PortalNewsAttachment.node_id,
            portal_orm.PortalNewsAttachment.sort_order,
            orm.Node.title,
            orm.Node.ctype,
        )
        .join(orm.Node, orm.Node.id == portal_orm.PortalNewsAttachment.node_id)
        .where(portal_orm.PortalNewsAttachment.news_id.in_(news_ids))
        .order_by(
            portal_orm.PortalNewsAttachment.news_id,
            portal_orm.PortalNewsAttachment.sort_order,
        )
    )
    by_news: dict[UUID, list[dict]] = {nid: [] for nid in news_ids}
    for row in (await db_session.execute(stmt)).all():
        news_id, node_id, _so, title, ctype = row
        by_news[news_id].append(
            {"node_id": node_id, "title": title, "ctype": ctype}
        )
    return by_news


async def _replace_news_attachments(
    db_session: AsyncSession,
    news_id: UUID,
    node_ids: list[UUID],
) -> None:
    await db_session.execute(
        delete(portal_orm.PortalNewsAttachment).where(
            portal_orm.PortalNewsAttachment.news_id == news_id
        )
    )
    for i, nid in enumerate(node_ids):
        db_session.add(
            portal_orm.PortalNewsAttachment(
                news_id=news_id, node_id=nid, sort_order=i
            )
        )


def _news_dict(
    news: portal_orm.PortalNews,
    *,
    author_username: str,
    attachments: list,
) -> dict:
    return {
        "id": news.id,
        "title": news.title,
        "body": news.body,
        "category": news.category,
        "is_pinned": bool(news.is_pinned),
        "created_at": news.created_at,
        "updated_at": news.updated_at,
        "author_id": news.author_id,
        "author_username": author_username,
        "attachments": attachments,
    }


async def list_portal_news_categories(db_session: AsyncSession) -> list[str]:
    stmt = (
        select(portal_orm.PortalNews.category)
        .where(
            portal_orm.PortalNews.category.isnot(None),
            portal_orm.PortalNews.category != "",
        )
        .distinct()
        .order_by(portal_orm.PortalNews.category)
    )
    return [row[0] for row in (await db_session.execute(stmt)).all() if row[0]]


async def list_portal_news(
    db_session: AsyncSession,
    *,
    page: int,
    page_size: int,
    category: str | None = None,
) -> tuple[list[dict], int]:
    """Paginated portal news posts: pinned first, then newest."""
    filters = []
    if category:
        filters.append(portal_orm.PortalNews.category == category)

    count_stmt = select(func.count()).select_from(portal_orm.PortalNews)
    if filters:
        count_stmt = count_stmt.where(*filters)
    total = int((await db_session.scalar(count_stmt)) or 0)
    offset = (page - 1) * page_size
    stmt = (
        select(
            portal_orm.PortalNews,
            orm.User.username,
            orm.User.first_name,
            orm.User.last_name,
        )
        .outerjoin(orm.User, orm.User.id == portal_orm.PortalNews.author_id)
        .order_by(
            desc(portal_orm.PortalNews.is_pinned),
            portal_orm.PortalNews.created_at.desc(),
        )
        .offset(offset)
        .limit(page_size)
    )
    if filters:
        stmt = stmt.where(*filters)
    rows = (await db_session.execute(stmt)).all()
    news_ids = [news.id for news, _username, _first, _last in rows]
    att_map = await _attachments_by_news_ids(db_session, news_ids)
    out: list[dict] = []
    for news, username, first_name, last_name in rows:
        out.append(
            _news_dict(
                news,
                author_username=_author_label(username, first_name, last_name),
                attachments=att_map.get(news.id, []),
            )
        )
    return out, total


async def create_portal_news(
    db_session: AsyncSession,
    *,
    user_id: UUID,
    title: str,
    body: str,
    attachment_node_ids: list[UUID],
    category: str | None = None,
    is_pinned: bool = False,
) -> dict:
    row = portal_orm.PortalNews(
        title=title,
        body=body,
        author_id=user_id,
        category=category,
        is_pinned=is_pinned,
    )
    db_session.add(row)
    await db_session.flush()
    await _replace_news_attachments(db_session, row.id, attachment_node_ids)
    await db_session.flush()
    att_map = await _attachments_by_news_ids(db_session, [row.id])
    return _news_dict(
        row,
        author_username=await _author_label_by_id(db_session, user_id),
        attachments=att_map.get(row.id, []),
    )


async def update_portal_news(
    db_session: AsyncSession,
    *,
    news_id: UUID,
    title: str | None,
    body: str | None,
    attachment_node_ids: list[UUID] | None,
    replace_attachments: bool,
    category: str | None = None,
    update_category: bool = False,
    is_pinned: bool | None = None,
) -> dict | None:
    stmt = select(portal_orm.PortalNews).where(portal_orm.PortalNews.id == news_id)
    row = (await db_session.scalars(stmt)).one_or_none()
    if row is None:
        return None
    if title is not None:
        row.title = title
    if body is not None:
        row.body = body
    if update_category:
        row.category = category.strip() if category else None
    if is_pinned is not None:
        row.is_pinned = is_pinned
    if replace_attachments and attachment_node_ids is not None:
        await _replace_news_attachments(db_session, news_id, attachment_node_ids)
    await db_session.flush()
    # `updated_at` has onupdate=func.now() and is expired on flush; reload it
    # explicitly — a lazy refresh here would raise MissingGreenlet.
    await db_session.refresh(row)
    att_map = await _attachments_by_news_ids(db_session, [row.id])
    return _news_dict(
        row,
        author_username=await _author_label_by_id(db_session, row.author_id),
        attachments=att_map.get(row.id, []),
    )


async def delete_portal_news(db_session: AsyncSession, news_id: UUID) -> bool:
    stmt = select(portal_orm.PortalNews).where(portal_orm.PortalNews.id == news_id)
    row = (await db_session.scalars(stmt)).one_or_none()
    if row is None:
        return False
    await db_session.delete(row)
    return True
