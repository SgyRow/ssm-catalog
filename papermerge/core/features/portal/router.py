from typing import Annotated, Union
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, Security
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import exceptions as exc
from papermerge.core import schema
from papermerge.core.db import common as dbapi_common
from papermerge.core.db.engine import get_db
from papermerge.core.features.auth import get_current_user, scopes
from papermerge.core.features.nodes.db import api as nodes_dbapi
from papermerge.core.features.portal import schema as portal_schema
from papermerge.core.features.portal.db import api as portal_dbapi
from papermerge.core.features.portal.policy import require_portal_view_if_under_portal
from papermerge.core.routers.params import CommonQueryParams
from papermerge.core.types import PaginatedResponse
from papermerge.core.features.library_ts.db import api as lib_ts_api

router = APIRouter(prefix="/portal", tags=["portal"])


@router.get("/root", response_model=portal_schema.PortalRootOut)
async def get_portal_root(
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.PORTAL_VIEW])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> portal_schema.PortalRootOut:
    """Return portal root folder metadata.

    """
    root_id = await portal_dbapi.get_portal_root_id(db_session)
    if root_id is None:
        raise exc.HTTP404NotFound()
    await require_portal_view_if_under_portal(db_session, user, root_id)
    await dbapi_common.require_node_perm(
        db_session,
        node_id=root_id,
        codename=scopes.NODE_VIEW,
        user_id=user.id,
    )
    folder = await nodes_dbapi.get_folder_by_id(db_session, root_id)
    await db_session.commit()
    return portal_schema.PortalRootOut.model_validate(folder)


@router.get(
    "/nodes/{parent_id}",
    response_model=PaginatedResponse[Union[schema.DocumentNode, schema.Folder]],
)
async def list_portal_children(
    parent_id: UUID,
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.PORTAL_VIEW])
    ],
    params: CommonQueryParams = Depends(),
    db_session: AsyncSession = Depends(get_db),
) -> PaginatedResponse[Union[schema.DocumentNode, schema.Folder]]:
    """Paginated direct children of a folder inside the portal tree.

    """
    root_id = await portal_dbapi.get_portal_root_id(db_session)
    if root_id is None:
        raise exc.HTTP404NotFound()
    if not await portal_dbapi.is_node_under_portal_root(
        db_session, parent_id, root_id
    ):
        raise exc.HTTP403Forbidden()
    await require_portal_view_if_under_portal(db_session, user, parent_id)
    await dbapi_common.require_node_perm(
        db_session,
        node_id=parent_id,
        codename=scopes.NODE_VIEW,
        user_id=user.id,
    )
    order_by = ["sort_index"]
    if params.order_by:
        order_by = [item.strip() for item in params.order_by.split(",")]

    nodes = await nodes_dbapi.get_paginated_nodes(
        db_session=db_session,
        parent_id=parent_id,
        user_id=user.id,
        page_size=params.page_size,
        page_number=params.page_number,
        order_by=order_by,
        filter=params.filter,
    )
    await db_session.commit()
    return nodes


@router.get("/feed", response_model=PaginatedResponse[portal_schema.PortalNewsOut])
async def get_portal_feed(
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.PORTAL_FEED_VIEW])
    ],
    db_session: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> PaginatedResponse[portal_schema.PortalNewsOut]:
    """News feed for the legal portal (editorial posts).

    """
    _ = user
    rows, total = await portal_dbapi.list_portal_news(
        db_session, page=page, page_size=page_size
    )
    await db_session.commit()
    num_pages = max(1, (total + page_size - 1) // page_size) if total else 1
    items = [portal_schema.PortalNewsOut(**r) for r in rows]
    return PaginatedResponse[portal_schema.PortalNewsOut](
        page_size=page_size,
        page_number=page,
        num_pages=num_pages,
        items=items,
    )


@router.post("/feed", response_model=portal_schema.PortalNewsOut)
async def create_portal_feed_item(
    payload: portal_schema.PortalNewsCreateIn,
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.PORTAL_FEED_MANAGE])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> portal_schema.PortalNewsOut:
    """Publish a news item on the portal feed.

    """
    try:
        attachment_ids = await portal_dbapi.validate_portal_news_attachment_nodes(
            db_session, user.id, list(payload.attachment_node_ids)
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    row = await portal_dbapi.create_portal_news(
        db_session,
        user_id=user.id,
        title=payload.title,
        body=payload.body,
        attachment_node_ids=attachment_ids,
    )
    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="portal_feed_create",
        resource_type="portal_news",
        resource_id=row["id"],
        detail=payload.title[:2000],
    )
    await lib_ts_api.notify_users_portal_feed_published(
        db_session,
        news_id=row["id"],
        title=row["title"],
        author_id=user.id,
        author_username=row["author_username"],
    )
    await db_session.commit()
    return portal_schema.PortalNewsOut(**row)


@router.patch("/feed/{news_id}", response_model=portal_schema.PortalNewsOut)
async def update_portal_feed_item(
    news_id: UUID,
    payload: portal_schema.PortalNewsUpdateIn,
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.PORTAL_FEED_MANAGE])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> portal_schema.PortalNewsOut:
    """Update a portal news item.

    """
    replace_attachments = payload.attachment_node_ids is not None
    attachment_ids: list[UUID] | None = None
    if replace_attachments:
        try:
            attachment_ids = await portal_dbapi.validate_portal_news_attachment_nodes(
                db_session, user.id, list(payload.attachment_node_ids or [])
            )
        except ValueError as err:
            raise HTTPException(status_code=400, detail=str(err)) from err
    row = await portal_dbapi.update_portal_news(
        db_session,
        news_id=news_id,
        title=payload.title,
        body=payload.body,
        attachment_node_ids=attachment_ids,
        replace_attachments=replace_attachments,
    )
    if row is None:
        raise exc.HTTP404NotFound()
    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="portal_feed_update",
        resource_type="portal_news",
        resource_id=news_id,
    )
    await db_session.commit()
    return portal_schema.PortalNewsOut(**row)


@router.delete("/feed/{news_id}", status_code=204, response_class=Response)
async def delete_portal_feed_item(
    news_id: UUID,
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.PORTAL_FEED_MANAGE])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> Response:
    """Delete a portal news item.

    """
    _ = user
    ok = await portal_dbapi.delete_portal_news(db_session, news_id)
    if not ok:
        raise exc.HTTP404NotFound()
    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="portal_feed_delete",
        resource_type="portal_news",
        resource_id=news_id,
    )
    await db_session.commit()
    return Response(status_code=204)
