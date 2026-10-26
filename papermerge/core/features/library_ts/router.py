"""Course TS: favorites, recent, trash helpers, collaboration, stats."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Security
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core.constants import INDEX_ADD_NODE
from papermerge.core.tasks import send_task
from papermerge.core import exceptions as exc
from papermerge.core import schema
from papermerge.core.db import common as dbapi_common
from papermerge.core.db.engine import get_db
from papermerge.core.features.auth import get_current_user, scopes
from papermerge.core.features.library_ts import schema as lib_schema
from papermerge.core.features.library_ts.db import api as lib_api
from papermerge.core.features.library_ts.db import settings_api as library_settings_api
from papermerge.core.features.library_ts.msp_folder_template import (
    create_msp_folder_tree,
)
from papermerge.core.features.nodes.db import api as nodes_dbapi
from papermerge.core.features.users.schema import user_display_name
from papermerge.core.features.portal import policy as portal_policy
from papermerge.core.features.portal.db import api as portal_dbapi
from papermerge.core.schema import PaginatedResponse

router = APIRouter(prefix="/library", tags=["library-ts"])


@router.post(
    "/msp-template/",
    response_model=lib_schema.MspTemplateCreateOut,
    status_code=201,
)
async def create_msp_template(
    body: lib_schema.MspTemplateCreateIn,
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.NODE_CREATE])
    ],
    db_session: AsyncSession = Depends(get_db),
):
    await dbapi_common.require_node_perm(
        db_session,
        node_id=body.parent_id,
        codename=scopes.NODE_CREATE,
        user_id=user.id,
    )
    await portal_policy.require_portal_on_create(
        db_session,
        user,
        body.parent_id,
        is_folder=True,
    )
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="title must not be empty")
    root, created_ids, error = await create_msp_folder_tree(
        db_session,
        parent_id=body.parent_id,
        title=title,
    )
    if error or root is None:
        raise HTTPException(status_code=400, detail=error.model_dump() if error else {})

    root_id = await portal_dbapi.get_portal_root_id(db_session)
    is_portal = bool(
        root_id
        and await portal_dbapi.is_node_under_portal_root(
            db_session, root.id, root_id
        )
    )
    await lib_api.add_audit(
        db_session,
        user_id=user.id,
        action="msp_template_create",
        resource_type="folder",
        resource_id=root.id,
        detail=lib_api.audit_detail_json(
            {"title": root.title, "folder_count": len(created_ids), "portal": is_portal}
        ),
    )
    await db_session.commit()

    for folder_id in created_ids:
        send_task(
            INDEX_ADD_NODE, kwargs={"node_id": str(folder_id)}, route_name="i3"
        )

    return lib_schema.MspTemplateCreateOut(
        root=root, folder_count=len(created_ids)
    )


def _can_modify_comment(
    user: schema.User, comment_author_id: uuid.UUID, moderate_scope: str
) -> bool:
    """Own comments are always editable; scopes apply to other users' comments only."""
    if comment_author_id == user.id:
        return True
    if getattr(user, "is_superuser", False):
        return True
    return moderate_scope in (user.scopes or [])


@router.get("/favorites", response_model=list[lib_schema.FavoriteRowOut])
@router.get("/favorites/", response_model=list[lib_schema.FavoriteRowOut])
async def list_favorites(
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    db_session: AsyncSession = Depends(get_db),
):
    rows = await lib_api.list_favorites_enriched(db_session, user.id)
    await db_session.commit()
    return rows


@router.post("/favorites/{node_id}", status_code=204)
@router.post("/favorites/{node_id}/", status_code=204)
async def add_favorite(
    node_id: uuid.UUID,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    db_session: AsyncSession = Depends(get_db),
):
    await dbapi_common.require_node_perm(
        db_session, node_id=node_id, codename=scopes.NODE_VIEW, user_id=user.id
    )
    await lib_api.add_favorite(db_session, user.id, node_id)
    await lib_api.add_audit(
        db_session,
        user_id=user.id,
        action="favorite_add",
        resource_type="node",
        resource_id=node_id,
    )
    await db_session.commit()


@router.delete("/favorites/{node_id}", status_code=204)
@router.delete("/favorites/{node_id}/", status_code=204)
async def remove_favorite(
    node_id: uuid.UUID,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    db_session: AsyncSession = Depends(get_db),
):
    await lib_api.remove_favorite(db_session, user.id, node_id)
    await lib_api.add_audit(
        db_session,
        user_id=user.id,
        action="favorite_remove",
        resource_type="node",
        resource_id=node_id,
    )
    await db_session.commit()


@router.get("/recent", response_model=list[lib_schema.RecentRowOut])
@router.get("/recent/", response_model=list[lib_schema.RecentRowOut])
async def list_recent(
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    db_session: AsyncSession = Depends(get_db),
):
    rows = await lib_api.list_recent_enriched(db_session, user.id)
    await db_session.commit()
    return rows


@router.get(
    "/trash",
    response_model=PaginatedResponse[schema.DocumentNode | schema.Folder],
)
@router.get(
    "/trash/",
    response_model=PaginatedResponse[schema.DocumentNode | schema.Folder],
)
async def list_trash(
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    db_session: AsyncSession = Depends(get_db),
    page_size: int = Query(50, ge=1, le=200),
    page_number: int = Query(1, ge=1),
):
    return await nodes_dbapi.list_trash_nodes(
        db_session, user_id=user.id, page_size=page_size, page_number=page_number
    )


@router.post("/trash/restore", status_code=204)
@router.post("/trash/restore/", status_code=204)
async def restore_trash(
    body: lib_schema.TrashBatchIn,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_UPDATE])],
    db_session: AsyncSession = Depends(get_db),
):
    err = await nodes_dbapi.restore_trash_nodes(
        db_session, node_ids=body.node_ids, user_id=user.id
    )
    if err:
        raise HTTPException(status_code=400, detail=err.model_dump())


@router.post("/trash/purge", status_code=204)
@router.post("/trash/purge/", status_code=204)
async def purge_trash(
    body: lib_schema.TrashBatchIn,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_DELETE])],
    db_session: AsyncSession = Depends(get_db),
):
    err = await nodes_dbapi.permanent_delete_trashed_nodes(
        db_session, node_ids=body.node_ids, user_id=user.id
    )
    if err:
        raise HTTPException(status_code=400, detail=err.model_dump())


@router.get(
    "/documents/{document_id}/note",
    response_model=lib_schema.NoteOut | None,
)
async def get_my_note(
    document_id: uuid.UUID,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    db_session: AsyncSession = Depends(get_db),
):
    await dbapi_common.require_node_perm(
        db_session, node_id=document_id, codename=scopes.NODE_VIEW, user_id=user.id
    )
    row = await lib_api.get_note(db_session, user.id, document_id)
    await db_session.commit()
    if row is None:
        return None
    return lib_schema.NoteOut(
        id=row.id,
        document_id=row.document_id,
        body=row.body,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.put(
    "/documents/{document_id}/note",
    response_model=lib_schema.NoteOut,
)
async def put_my_note(
    document_id: uuid.UUID,
    payload: lib_schema.NoteCreate,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_UPDATE])],
    db_session: AsyncSession = Depends(get_db),
):
    await dbapi_common.require_node_perm(
        db_session, node_id=document_id, codename=scopes.NODE_UPDATE, user_id=user.id
    )
    row = await lib_api.upsert_note(db_session, user.id, document_id, payload.body)
    await lib_api.add_audit(
        db_session,
        user_id=user.id,
        action="note_upsert",
        resource_type="document",
        resource_id=document_id,
    )
    await db_session.commit()
    return lib_schema.NoteOut(
        id=row.id,
        document_id=row.document_id,
        body=row.body,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get(
    "/documents/{document_id}/comments",
    response_model=list[lib_schema.CommentOut],
)
async def list_doc_comments(
    document_id: uuid.UUID,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    db_session: AsyncSession = Depends(get_db),
):
    await dbapi_common.require_node_perm(
        db_session, node_id=document_id, codename=scopes.NODE_VIEW, user_id=user.id
    )
    rows = await lib_api.list_comments(db_session, document_id)
    await db_session.commit()
    return [
        lib_schema.CommentOut(
            id=r.id,
            document_id=r.document_id,
            user_id=r.user_id,
            author=user_display_name(first_name, last_name, username),
            body=r.body,
            created_at=r.created_at,
        )
        for r, username, first_name, last_name in rows
    ]


@router.post(
    "/documents/{document_id}/comments",
    response_model=lib_schema.CommentOut,
    status_code=201,
)
async def add_doc_comment(
    document_id: uuid.UUID,
    payload: lib_schema.CommentCreate,
    user: Annotated[
        schema.User,
        Security(
            get_current_user, scopes=[scopes.NODE_VIEW, scopes.COMMENT_CREATE]
        ),
    ],
    db_session: AsyncSession = Depends(get_db),
):
    await dbapi_common.require_node_perm(
        db_session, node_id=document_id, codename=scopes.NODE_VIEW, user_id=user.id
    )
    row = await lib_api.add_comment(db_session, user.id, document_id, payload.body)
    await lib_api.add_audit(
        db_session,
        user_id=user.id,
        action="comment_add",
        resource_type="document",
        resource_id=document_id,
        detail=lib_api.audit_detail_json({"comment_id": str(row.id)}),
    )
    await db_session.commit()
    return lib_schema.CommentOut(
        id=row.id,
        document_id=row.document_id,
        user_id=row.user_id,
        author=user_display_name(user.first_name, user.last_name, user.username),
        body=row.body,
        created_at=row.created_at,
    )


@router.put(
    "/documents/{document_id}/comments/{comment_id}",
    response_model=lib_schema.CommentOut,
)
async def update_doc_comment(
    document_id: uuid.UUID,
    comment_id: uuid.UUID,
    payload: lib_schema.CommentUpdate,
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])
    ],
    db_session: AsyncSession = Depends(get_db),
):
    await dbapi_common.require_node_perm(
        db_session, node_id=document_id, codename=scopes.NODE_VIEW, user_id=user.id
    )
    row = await lib_api.get_comment(db_session, comment_id)
    if row is None or row.document_id != document_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    if not _can_modify_comment(user, row.user_id, scopes.COMMENT_UPDATE):
        raise exc.HTTP403Forbidden()
    row = await lib_api.update_comment(db_session, comment_id, payload.body)
    author_info = await lib_api.get_user_display_fields_by_id(db_session, row.user_id)
    if author_info:
        author_username, author_first, author_last = author_info
        author = user_display_name(author_first, author_last, author_username)
    else:
        author = ""
    await lib_api.add_audit(
        db_session,
        user_id=user.id,
        action="comment_update",
        resource_type="document",
        resource_id=document_id,
        detail=lib_api.audit_detail_json({"comment_id": str(comment_id)}),
    )
    await db_session.commit()
    return lib_schema.CommentOut(
        id=row.id,
        document_id=row.document_id,
        user_id=row.user_id,
        author=author,
        body=row.body,
        created_at=row.created_at,
    )


@router.delete("/documents/{document_id}/comments/{comment_id}", status_code=204)
async def delete_doc_comment(
    document_id: uuid.UUID,
    comment_id: uuid.UUID,
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])
    ],
    db_session: AsyncSession = Depends(get_db),
):
    await dbapi_common.require_node_perm(
        db_session, node_id=document_id, codename=scopes.NODE_VIEW, user_id=user.id
    )
    row = await lib_api.get_comment(db_session, comment_id)
    if row is None or row.document_id != document_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    if not _can_modify_comment(user, row.user_id, scopes.COMMENT_DELETE):
        raise exc.HTTP403Forbidden()
    await lib_api.delete_comment(db_session, comment_id)
    await lib_api.add_audit(
        db_session,
        user_id=user.id,
        action="comment_delete",
        resource_type="document",
        resource_id=document_id,
        detail=lib_api.audit_detail_json({"comment_id": str(comment_id)}),
    )
    await db_session.commit()


@router.get(
    "/documents/{document_id}/rating",
    response_model=lib_schema.RatingOut,
)
async def get_rating(
    document_id: uuid.UUID,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    db_session: AsyncSession = Depends(get_db),
):
    await dbapi_common.require_node_perm(
        db_session, node_id=document_id, codename=scopes.NODE_VIEW, user_id=user.id
    )
    avg, n = await lib_api.rating_aggregate(db_session, document_id)
    row = await lib_api.get_user_rating(db_session, user.id, document_id)
    await db_session.commit()
    return lib_schema.RatingOut(
        user_id=user.id,
        document_id=document_id,
        score=row.score if row else 0,
        avg_score=avg if n else None,
        vote_count=n,
    )


@router.put(
    "/documents/{document_id}/rating",
    response_model=lib_schema.RatingOut,
)
async def put_rating(
    document_id: uuid.UUID,
    payload: lib_schema.RatingCreate,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    db_session: AsyncSession = Depends(get_db),
):
    await dbapi_common.require_node_perm(
        db_session, node_id=document_id, codename=scopes.NODE_VIEW, user_id=user.id
    )
    await lib_api.set_rating(db_session, user.id, document_id, payload.score)
    avg, n = await lib_api.rating_aggregate(db_session, document_id)
    row = await lib_api.get_user_rating(db_session, user.id, document_id)
    await lib_api.add_audit(
        db_session,
        user_id=user.id,
        action="rating_set",
        resource_type="document",
        resource_id=document_id,
        detail=str(payload.score),
    )
    await db_session.commit()
    return lib_schema.RatingOut(
        user_id=user.id,
        document_id=document_id,
        score=row.score if row else payload.score,
        avg_score=avg if n else None,
        vote_count=n,
    )


@router.get(
    "/documents/{document_id}/full-versions",
    response_model=list[lib_schema.FullVersionAttachmentOut],
)
async def list_document_full_versions(
    document_id: uuid.UUID,
    user: Annotated[
        schema.User,
        Security(
            get_current_user,
            scopes=[scopes.NODE_VIEW, scopes.DOCUMENT_FULL_VERSION_VIEW],
        ),
    ],
    db_session: AsyncSession = Depends(get_db),
):
    await dbapi_common.require_node_perm(
        db_session, node_id=document_id, codename=scopes.NODE_VIEW, user_id=user.id
    )
    rows = await lib_api.list_full_version_attachments(db_session, document_id)
    await db_session.commit()
    return [lib_schema.FullVersionAttachmentOut(**row) for row in rows]


@router.put(
    "/documents/{document_id}/full-versions",
    response_model=list[lib_schema.FullVersionAttachmentOut],
)
async def put_document_full_versions(
    document_id: uuid.UUID,
    payload: lib_schema.FullVersionAttachmentsUpdate,
    user: Annotated[
        schema.User,
        Security(
            get_current_user,
            scopes=[scopes.NODE_VIEW, scopes.DOCUMENT_FULL_VERSION_MANAGE],
        ),
    ],
    db_session: AsyncSession = Depends(get_db),
):
    await dbapi_common.require_node_perm(
        db_session, node_id=document_id, codename=scopes.NODE_VIEW, user_id=user.id
    )
    try:
        attachment_ids = await portal_dbapi.validate_portal_news_attachment_nodes(
            db_session,
            user_id=user.id,
            node_ids=payload.node_ids,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if len(attachment_ids) > lib_api.MAX_DOCUMENT_FULL_VERSION_ATTACHMENTS:
        raise HTTPException(status_code=400, detail="too_many_attachments")
    await lib_api.replace_full_version_attachments(
        db_session, document_id, attachment_ids
    )
    await lib_api.add_audit(
        db_session,
        user_id=user.id,
        action="full_version_update",
        resource_type="document",
        resource_id=document_id,
        detail=lib_api.audit_detail_json(
            {"attachment_count": len(attachment_ids)}
        ),
    )
    await db_session.commit()
    rows = await lib_api.list_full_version_attachments(db_session, document_id)
    return [lib_schema.FullVersionAttachmentOut(**row) for row in rows]


@router.get("/notifications", response_model=list[lib_schema.NotificationOut])
@router.get("/notifications/", response_model=list[lib_schema.NotificationOut])
async def list_my_notifications(
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.USER_ME])],
    db_session: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
):
    await lib_api.ensure_ocr_complete_notifications(db_session, user_id=user.id)
    rows = await lib_api.list_notifications(db_session, user.id, limit=limit)
    await db_session.commit()
    return [
        lib_schema.NotificationOut(
            id=r.id,
            kind=r.kind,
            payload=r.payload,
            read_at=r.read_at,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/notifications/{notif_id}/read", status_code=204)
async def read_notification(
    notif_id: uuid.UUID,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.USER_ME])],
    db_session: AsyncSession = Depends(get_db),
):
    await lib_api.mark_notification_read(db_session, user.id, notif_id)
    await db_session.commit()


@router.post("/audit/session", status_code=204)
@router.post("/audit/session/", status_code=204)
async def record_session_audit(
    body: lib_schema.SessionAuditIn,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.USER_ME])],
    db_session: AsyncSession = Depends(get_db),
):
    action = "auth_login" if body.event == "login" else "auth_logout"
    await lib_api.add_audit(
        db_session,
        user_id=user.id,
        action=action,
        resource_type="session",
        resource_id=user.id,
        detail=user.username,
    )
    await db_session.commit()


@router.get("/audit", response_model=PaginatedResponse[lib_schema.AuditEntryOut])
@router.get("/audit/", response_model=PaginatedResponse[lib_schema.AuditEntryOut])
async def list_audit_log(
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.USER_VIEW])],
    db_session: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    if not user.is_superuser:
        raise exc.HTTP403Forbidden()
    rows, total = await lib_api.list_audit(db_session, page=page, page_size=page_size)
    await db_session.commit()
    num_pages = max(1, (int(total) + page_size - 1) // page_size) if total else 1
    items = [
        lib_schema.AuditEntryOut(
            id=r.id,
            user_id=r.user_id,
            action=r.action,
            resource_type=r.resource_type,
            resource_id=r.resource_id,
            detail=r.detail,
            created_at=r.created_at,
        )
        for r in rows
    ]
    return PaginatedResponse[lib_schema.AuditEntryOut](
        page_size=page_size,
        page_number=page,
        num_pages=num_pages,
        items=items,
    )


@router.get("/stats/summary", response_model=lib_schema.LibraryStatsOut)
@router.get("/stats/summary/", response_model=lib_schema.LibraryStatsOut)
async def library_stats(
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.USER_VIEW])],
    db_session: AsyncSession = Depends(get_db),
):
    if not user.is_superuser:
        raise exc.HTTP403Forbidden()
    data = await lib_api.stats_summary(db_session)
    await db_session.commit()
    return lib_schema.LibraryStatsOut(**data)


@router.get("/settings", response_model=lib_schema.LibrarySettingsOut)
@router.get("/settings/", response_model=lib_schema.LibrarySettingsOut)
async def get_library_settings(
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    db_session: AsyncSession = Depends(get_db),
):
    days = await library_settings_api.get_trash_retention_days(db_session)
    return lib_schema.LibrarySettingsOut(trash_retention_days=days)


@router.patch("/settings", response_model=lib_schema.LibrarySettingsOut)
@router.patch("/settings/", response_model=lib_schema.LibrarySettingsOut)
async def update_library_settings(
    body: lib_schema.LibrarySettingsUpdate,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.USER_VIEW])],
    db_session: AsyncSession = Depends(get_db),
):
    if not user.is_superuser:
        raise exc.HTTP403Forbidden()
    days = await library_settings_api.set_trash_retention_days(
        db_session, body.trash_retention_days
    )
    return lib_schema.LibrarySettingsOut(trash_retention_days=days)
