import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import and_, delete, exists, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import orm
from papermerge.core.features.library_ts.db import settings_api as library_settings_api
from papermerge.core.db import common as db_common
from papermerge.core.features.auth import scopes
from papermerge.core.features.library_ts.db import orm as lib_orm
from papermerge.core.pathlib import abs_page_txt_path

logger = logging.getLogger(__name__)

RECENT_LIMIT = 50
OCR_COMPLETED_KIND = "ocr_completed"
PORTAL_FEED_PUBLISHED_KIND = "portal_feed_published"


def audit_detail_json(data: object) -> str:
    """Serialize audit metadata with readable Unicode (not \\uXXXX escapes)."""
    return json.dumps(data, ensure_ascii=False)[:2000]


def _utc_naive_now() -> datetime:
    """Naive UTC for TIMESTAMP WITHOUT TIME ZONE columns (asyncpg requirement)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def add_audit(
    db_session: AsyncSession,
    *,
    user_id: UUID | None,
    action: str,
    resource_type: str,
    resource_id: UUID | None = None,
    detail: str | None = None,
) -> None:
    row = lib_orm.AuditLogEntry(
        id=uuid.uuid4(),
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=(detail[:2000] if detail else None),
    )
    db_session.add(row)


async def add_favorite(db_session: AsyncSession, user_id: UUID, node_id: UUID) -> None:
    existing = await db_session.scalar(
        select(lib_orm.UserFavorite).where(
            lib_orm.UserFavorite.user_id == user_id,
            lib_orm.UserFavorite.node_id == node_id,
        )
    )
    if existing:
        return
    db_session.add(
        lib_orm.UserFavorite(
            user_id=user_id, node_id=node_id, created_at=_utc_naive_now()
        )
    )


async def remove_favorite(db_session: AsyncSession, user_id: UUID, node_id: UUID) -> None:
    await db_session.execute(
        delete(lib_orm.UserFavorite).where(
            lib_orm.UserFavorite.user_id == user_id,
            lib_orm.UserFavorite.node_id == node_id,
        )
    )


async def list_favorites(db_session: AsyncSession, user_id: UUID) -> list[lib_orm.UserFavorite]:
    stmt = (
        select(lib_orm.UserFavorite)
        .where(lib_orm.UserFavorite.user_id == user_id)
        .order_by(lib_orm.UserFavorite.created_at.desc())
    )
    return list((await db_session.scalars(stmt)).all())


async def list_favorites_enriched(db_session: AsyncSession, user_id: UUID):
    from papermerge.core.features.library_ts import schema as lib_schema

    stmt = (
        select(
            lib_orm.UserFavorite,
            orm.Node.title,
            orm.Node.ctype,
            orm.Node.deleted_at,
        )
        .join(orm.Node, orm.Node.id == lib_orm.UserFavorite.node_id)
        .where(lib_orm.UserFavorite.user_id == user_id)
        .order_by(lib_orm.UserFavorite.created_at.desc())
    )
    rows = (await db_session.execute(stmt)).all()
    out: list[lib_schema.FavoriteRowOut] = []
    for fav, title, ctype, deleted_at in rows:
        out.append(
            lib_schema.FavoriteRowOut(
                node_id=fav.node_id,
                title=title,
                ctype=str(ctype),
                created_at=fav.created_at,
                in_trash=deleted_at is not None,
            )
        )
    return out


async def record_recent_view(db_session: AsyncSession, user_id: UUID, node_id: UUID) -> None:
    now = _utc_naive_now()
    await db_session.execute(
        delete(lib_orm.UserRecentDocument).where(
            lib_orm.UserRecentDocument.user_id == user_id,
            lib_orm.UserRecentDocument.node_id == node_id,
        )
    )
    db_session.add(
        lib_orm.UserRecentDocument(
            id=uuid.uuid4(), user_id=user_id, node_id=node_id, viewed_at=now
        )
    )
    stmt = (
        select(lib_orm.UserRecentDocument)
        .where(lib_orm.UserRecentDocument.user_id == user_id)
        .order_by(lib_orm.UserRecentDocument.viewed_at.desc())
    )
    rows = list((await db_session.scalars(stmt)).all())
    for extra in rows[RECENT_LIMIT:]:
        await db_session.delete(extra)


async def list_recent(db_session: AsyncSession, user_id: UUID) -> list[lib_orm.UserRecentDocument]:
    stmt = (
        select(lib_orm.UserRecentDocument)
        .where(lib_orm.UserRecentDocument.user_id == user_id)
        .order_by(lib_orm.UserRecentDocument.viewed_at.desc())
        .limit(RECENT_LIMIT)
    )
    return list((await db_session.scalars(stmt)).all())


async def list_recent_enriched(db_session: AsyncSession, user_id: UUID):
    from papermerge.core.features.library_ts import schema as lib_schema

    urd = lib_orm.UserRecentDocument
    stmt = (
        select(urd, orm.Node.title, orm.Node.ctype)
        .select_from(urd)
        .join(orm.Node, orm.Node.id == urd.node_id)
        .where(
            urd.user_id == user_id,
            orm.Node.deleted_at.is_(None),
        )
        .order_by(urd.viewed_at.desc())
        .limit(RECENT_LIMIT)
    )
    rows = (await db_session.execute(stmt)).all()
    out: list[lib_schema.RecentRowOut] = []
    for rec, title, ctype in rows:
        out.append(
            lib_schema.RecentRowOut(
                node_id=rec.node_id,
                title=title,
                ctype=str(ctype),
                viewed_at=rec.viewed_at,
                in_trash=False,
            )
        )
    return out


async def increment_view(db_session: AsyncSession, document_id: UUID) -> None:
    row = await db_session.scalar(
        select(lib_orm.DocumentCounter).where(
            lib_orm.DocumentCounter.document_id == document_id
        )
    )
    if row is None:
        db_session.add(
            lib_orm.DocumentCounter(document_id=document_id, view_count=1, download_count=0)
        )
    else:
        row.view_count += 1


async def increment_download(db_session: AsyncSession, document_id: UUID) -> None:
    row = await db_session.scalar(
        select(lib_orm.DocumentCounter).where(
            lib_orm.DocumentCounter.document_id == document_id
        )
    )
    if row is None:
        db_session.add(
            lib_orm.DocumentCounter(document_id=document_id, view_count=0, download_count=1)
        )
    else:
        row.download_count += 1


async def upsert_note(
    db_session: AsyncSession, user_id: UUID, document_id: UUID, body: str
) -> lib_orm.DocumentNote:
    row = await db_session.scalar(
        select(lib_orm.DocumentNote).where(
            lib_orm.DocumentNote.user_id == user_id,
            lib_orm.DocumentNote.document_id == document_id,
        )
    )
    if row:
        row.body = body[:8000]
        row.updated_at = _utc_naive_now()
        return row
    row = lib_orm.DocumentNote(
        id=uuid.uuid4(),
        user_id=user_id,
        document_id=document_id,
        body=body[:8000],
    )
    db_session.add(row)
    return row


async def get_note(
    db_session: AsyncSession, user_id: UUID, document_id: UUID
) -> lib_orm.DocumentNote | None:
    return await db_session.scalar(
        select(lib_orm.DocumentNote).where(
            lib_orm.DocumentNote.user_id == user_id,
            lib_orm.DocumentNote.document_id == document_id,
        )
    )


async def list_comments(
    db_session: AsyncSession, document_id: UUID
) -> list[tuple[lib_orm.DocumentComment, str, str | None, str | None]]:
    stmt = (
        select(lib_orm.DocumentComment, orm.User.username, orm.User.first_name, orm.User.last_name)
        .join(orm.User, orm.User.id == lib_orm.DocumentComment.user_id)
        .where(lib_orm.DocumentComment.document_id == document_id)
        .order_by(lib_orm.DocumentComment.created_at.asc())
    )
    return list((await db_session.execute(stmt)).all())


async def add_comment(
    db_session: AsyncSession, user_id: UUID, document_id: UUID, body: str
) -> lib_orm.DocumentComment:
    row = lib_orm.DocumentComment(
        id=uuid.uuid4(),
        user_id=user_id,
        document_id=document_id,
        body=body[:8000],
        created_at=_utc_naive_now(),
    )
    db_session.add(row)
    return row


async def get_comment(
    db_session: AsyncSession, comment_id: UUID
) -> lib_orm.DocumentComment | None:
    return await db_session.scalar(
        select(lib_orm.DocumentComment).where(lib_orm.DocumentComment.id == comment_id)
    )


async def update_comment(
    db_session: AsyncSession, comment_id: UUID, body: str
) -> lib_orm.DocumentComment | None:
    row = await get_comment(db_session, comment_id)
    if row is None:
        return None
    row.body = body[:8000]
    return row


async def delete_comment(db_session: AsyncSession, comment_id: UUID) -> None:
    await db_session.execute(
        delete(lib_orm.DocumentComment).where(lib_orm.DocumentComment.id == comment_id)
    )


async def get_username_by_user_id(
    db_session: AsyncSession, user_id: UUID
) -> str | None:
    return await db_session.scalar(select(orm.User.username).where(orm.User.id == user_id))


async def get_user_display_fields_by_id(
    db_session: AsyncSession, user_id: UUID
) -> tuple[str, str | None, str | None] | None:
    """Return (username, first_name, last_name) for the given user_id, or None."""
    row = (
        await db_session.execute(
            select(orm.User.username, orm.User.first_name, orm.User.last_name).where(
                orm.User.id == user_id
            )
        )
    ).one_or_none()
    if row is None:
        return None
    return row.username, row.first_name, row.last_name


async def set_rating(
    db_session: AsyncSession, user_id: UUID, document_id: UUID, score: int
) -> lib_orm.DocumentRating:
    row = await db_session.scalar(
        select(lib_orm.DocumentRating).where(
            lib_orm.DocumentRating.user_id == user_id,
            lib_orm.DocumentRating.document_id == document_id,
        )
    )
    if row:
        row.score = score
        return row
    row = lib_orm.DocumentRating(
        user_id=user_id, document_id=document_id, score=score
    )
    db_session.add(row)
    return row


async def rating_aggregate(
    db_session: AsyncSession, document_id: UUID
) -> tuple[float, int]:
    stmt = select(
        func.coalesce(func.avg(lib_orm.DocumentRating.score), 0.0),
        func.count(lib_orm.DocumentRating.user_id),
    ).where(lib_orm.DocumentRating.document_id == document_id)
    row = (await db_session.execute(stmt)).one()
    return float(row[0]), int(row[1])


async def get_user_rating(
    db_session: AsyncSession, user_id: UUID, document_id: UUID
) -> lib_orm.DocumentRating | None:
    return await db_session.scalar(
        select(lib_orm.DocumentRating).where(
            lib_orm.DocumentRating.user_id == user_id,
            lib_orm.DocumentRating.document_id == document_id,
        )
    )


async def log_search_query(
    db_session: AsyncSession, user_id: UUID | None, query_text: str
) -> None:
    db_session.add(
        lib_orm.SearchQueryLog(
            id=uuid.uuid4(),
            user_id=user_id,
            query_text=query_text[:2000],
        )
    )


async def notify_users_document_changed(
    db_session: AsyncSession,
    *,
    document_id: UUID,
    title: str,
    user_ids: list[UUID],
    kind: str = "document_updated",
) -> None:
    payload = json.dumps({"document_id": str(document_id), "title": title})
    for uid in user_ids:
        db_session.add(
            lib_orm.UserNotification(
                id=uuid.uuid4(),
                user_id=uid,
                kind=kind,
                payload=payload,
                created_at=_utc_naive_now(),
            )
        )


async def list_active_user_ids_with_scope(
    db_session: AsyncSession, scope_codename: str
) -> list[UUID]:
    from papermerge.core.features.roles.db.orm import (
        Permission,
        roles_permissions_association,
        users_roles_association,
    )

    role_ids_with_scope = (
        select(roles_permissions_association.c.role_id)
        .join(
            Permission,
            Permission.id == roles_permissions_association.c.permission_id,
        )
        .where(Permission.codename == scope_codename)
    )
    stmt = select(orm.User.id).where(
        orm.User.is_active.is_(True),
        or_(
            orm.User.is_superuser.is_(True),
            orm.User.id.in_(
                select(users_roles_association.c.user_id).where(
                    users_roles_association.c.role_id.in_(role_ids_with_scope)
                )
            ),
        ),
    )
    return list((await db_session.scalars(stmt)).all())


async def notify_users_portal_feed_published(
    db_session: AsyncSession,
    *,
    news_id: UUID,
    title: str,
    author_id: UUID,
    author_username: str,
) -> None:
    """Notify every active user who can view the portal feed (except the author)."""
    viewer_ids = await list_active_user_ids_with_scope(
        db_session, scopes.PORTAL_FEED_VIEW
    )
    payload = audit_detail_json(
        {
            "news_id": str(news_id),
            "title": title,
            "author_username": author_username,
        }
    )
    for uid in viewer_ids:
        if uid == author_id:
            continue
        db_session.add(
            lib_orm.UserNotification(
                id=uuid.uuid4(),
                user_id=uid,
                kind=PORTAL_FEED_PUBLISHED_KIND,
                payload=payload,
                created_at=_utc_naive_now(),
            )
        )


async def list_notifications(
    db_session: AsyncSession, user_id: UUID, limit: int = 50
) -> list[lib_orm.UserNotification]:
    stmt = (
        select(lib_orm.UserNotification)
        .where(lib_orm.UserNotification.user_id == user_id)
        .order_by(lib_orm.UserNotification.created_at.desc())
        .limit(limit)
    )
    return list((await db_session.scalars(stmt)).all())


async def ensure_ocr_complete_notifications(
    db_session: AsyncSession,
    *,
    user_id: UUID,
) -> None:
    existing_rows = (
        await db_session.execute(
            select(lib_orm.UserNotification.payload).where(
                lib_orm.UserNotification.user_id == user_id,
                lib_orm.UserNotification.kind == OCR_COMPLETED_KIND,
            )
        )
    ).all()
    existing_doc_ver_ids: set[str] = set()
    for row in existing_rows:
        if not row.payload:
            continue
        try:
            payload = json.loads(row.payload)
        except json.JSONDecodeError:
            continue
        doc_ver_id = payload.get("document_version_id")
        if doc_ver_id:
            existing_doc_ver_ids.add(str(doc_ver_id))

    latest_ver_num = (
        select(
            orm.DocumentVersion.document_id.label("document_id"),
            func.max(orm.DocumentVersion.number).label("max_number"),
        )
        .group_by(orm.DocumentVersion.document_id)
        .subquery()
    )

    page_text_exists = exists(
        select(orm.Page.id).where(
            and_(
                orm.Page.document_version_id == orm.DocumentVersion.id,
                orm.Page.text.is_not(None),
                orm.Page.text != "",
            )
        )
    )

    stmt = (
        select(
            orm.Document.id,
            orm.Document.title,
            orm.DocumentVersion.id,
        )
        .join(
            latest_ver_num,
            latest_ver_num.c.document_id == orm.Document.id,
        )
        .join(
            orm.DocumentVersion,
            (orm.DocumentVersion.document_id == orm.Document.id)
            & (orm.DocumentVersion.number == latest_ver_num.c.max_number),
        )
        .where(
            or_(
                and_(
                    orm.DocumentVersion.text.is_not(None),
                    orm.DocumentVersion.text != "",
                ),
                page_text_exists,
            ),
            orm.Document.deleted_at.is_(None),
        )
        .order_by(orm.Document.updated_at.desc())
        .limit(200)
    )
    rows = (await db_session.execute(stmt)).all()

    for document_id, title, doc_ver_id in rows:
        if str(doc_ver_id) in existing_doc_ver_ids:
            continue
        # Notify only for real OCR runs (worker artifacts exist). PDFs with
        # embedded selectable text should not create OCR-complete notifications.
        if not await has_ocr_artifacts_for_doc_ver(db_session, doc_ver_id):
            continue
        has_access = await db_common.has_node_perm(
            db_session,
            node_id=document_id,
            codename=scopes.NODE_VIEW,
            user_id=user_id,
        )
        if not has_access:
            continue
        payload = json.dumps(
            {
                "document_id": str(document_id),
                "document_version_id": str(doc_ver_id),
                "title": title,
                "finished_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        db_session.add(
            lib_orm.UserNotification(
                id=uuid.uuid4(),
                user_id=user_id,
                kind=OCR_COMPLETED_KIND,
                payload=payload,
                created_at=_utc_naive_now(),
            )
        )
        existing_doc_ver_ids.add(str(doc_ver_id))


async def has_ocr_artifacts_for_doc_ver(
    db_session: AsyncSession,
    doc_ver_id: UUID,
) -> bool:
    page_ids = (
        await db_session.execute(
            select(orm.Page.id).where(orm.Page.document_version_id == doc_ver_id)
        )
    ).scalars().all()
    for page_id in page_ids:
        if abs_page_txt_path(page_id).is_file():
            return True
    return False


async def mark_notification_read(
    db_session: AsyncSession, user_id: UUID, notif_id: UUID
) -> None:
    await db_session.execute(
        update(lib_orm.UserNotification)
        .where(
            lib_orm.UserNotification.id == notif_id,
            lib_orm.UserNotification.user_id == user_id,
        )
        .values(read_at=_utc_naive_now())
    )


async def list_audit(
    db_session: AsyncSession, page: int, page_size: int
) -> tuple[list[lib_orm.AuditLogEntry], int]:
    offset = (page - 1) * page_size
    total = await db_session.scalar(select(func.count(lib_orm.AuditLogEntry.id)))
    stmt = (
        select(lib_orm.AuditLogEntry)
        .order_by(lib_orm.AuditLogEntry.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = list((await db_session.scalars(stmt)).all())
    return rows, int(total or 0)


async def stats_summary(db_session: AsyncSession) -> dict:
    doc_count = await db_session.scalar(
        select(func.count(orm.Node.id)).where(
            orm.Node.ctype == "document", orm.Node.deleted_at.is_(None)
        )
    )
    vc = await db_session.scalar(select(func.coalesce(func.sum(lib_orm.DocumentCounter.view_count), 0)))
    dc = await db_session.scalar(
        select(func.coalesce(func.sum(lib_orm.DocumentCounter.download_count), 0))
    )
    # popular queries
    sq = (
        select(lib_orm.SearchQueryLog.query_text, func.count())
        .group_by(lib_orm.SearchQueryLog.query_text)
        .order_by(func.count().desc())
        .limit(10)
    )
    popular = [
        {"query": r[0], "count": r[1]}
        for r in (await db_session.execute(sq)).all()
    ]
    return {
        "total_documents": int(doc_count or 0),
        "total_views": int(vc or 0),
        "total_downloads": int(dc or 0),
        "popular_search_queries": popular,
    }


async def purge_expired_trash(
    db_session: AsyncSession, retention_days: int, now: datetime | None = None
) -> list[UUID]:
    """Return node IDs in trash longer than retention_days."""
    if retention_days < 1:
        return []
    if now is None:
        now = _utc_naive_now()
    elif now.tzinfo is not None:
        now = now.astimezone(timezone.utc).replace(tzinfo=None)
    cutoff = now - timedelta(days=retention_days)
    stmt = select(orm.Node.id).where(
        orm.Node.deleted_at.is_not(None),
        orm.Node.deleted_at < cutoff,
    )
    ids = [r[0] for r in (await db_session.execute(stmt)).all()]
    return ids


async def run_auto_trash_purge(db_session: AsyncSession) -> list[UUID]:
    """Permanently delete trashed nodes past the configured retention window."""
    from papermerge.core.constants import INDEX_REMOVE_NODE
    from papermerge.core.features.nodes.db import api as nodes_dbapi
    from papermerge.core.tasks import send_task

    retention_days = await library_settings_api.get_trash_retention_days(db_session)
    expired_roots = await purge_expired_trash(db_session, retention_days)
    if not expired_roots:
        return []
    removed = await nodes_dbapi.hard_delete_nodes_system(db_session, expired_roots)
    if removed:
        send_task(
            INDEX_REMOVE_NODE,
            kwargs={"item_ids": [str(i) for i in removed]},
            route_name="i3",
        )
    return removed


MAX_DOCUMENT_FULL_VERSION_ATTACHMENTS = 30


async def list_full_version_attachments(
    db_session: AsyncSession, document_id: UUID
) -> list[dict]:
    stmt = (
        select(
            lib_orm.DocumentFullVersionAttachment.node_id,
            lib_orm.DocumentFullVersionAttachment.sort_order,
            orm.Node.title,
            orm.Node.ctype,
        )
        .join(orm.Node, orm.Node.id == lib_orm.DocumentFullVersionAttachment.node_id)
        .where(lib_orm.DocumentFullVersionAttachment.document_id == document_id)
        .order_by(lib_orm.DocumentFullVersionAttachment.sort_order)
    )
    return [
        {"node_id": node_id, "title": title, "ctype": ctype}
        for node_id, _sort_order, title, ctype in (await db_session.execute(stmt)).all()
    ]


async def replace_full_version_attachments(
    db_session: AsyncSession,
    document_id: UUID,
    node_ids: list[UUID],
) -> None:
    await db_session.execute(
        delete(lib_orm.DocumentFullVersionAttachment).where(
            lib_orm.DocumentFullVersionAttachment.document_id == document_id
        )
    )
    for i, nid in enumerate(node_ids):
        db_session.add(
            lib_orm.DocumentFullVersionAttachment(
                document_id=document_id,
                node_id=nid,
                sort_order=i,
            )
        )
