from datetime import date, datetime, time
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Security
from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from papermerge.core import exceptions as exc
from papermerge.core import schema
from papermerge.core.db.engine import get_db
from papermerge.core.features.auth import get_current_user, scopes
from papermerge.core.features.citizen_categories.db import orm as cat_orm
from papermerge.core.features.nodes.visibility import can_view_node
from papermerge.core.features.portal.db import api as portal_dbapi
from papermerge.core.features.search_advanced.schema import (
    AdvancedSearchItem,
    AdvancedSearchResponse,
)
from papermerge.core.features.tags.db.orm import NodeTagsAssociation
from papermerge.core.orm import Node

router = APIRouter(prefix="/advanced-search", tags=["search"])

MaterialKind = Literal[
    "normative", "reference", "measure", "methodical", "form"
]

KIND_PATTERNS: dict[str, tuple[str, ...]] = {
    "normative": ("норматив", "закон", "постановлен", "приказ"),
    "reference": ("справоч", "памятк"),
    "measure": ("мер социаль", "описание меры", "пособи", "выплат", "мсп"),
    "methodical": ("методич", "регламент"),
    "form": ("бланк", "заявлен", "форма"),
}


def _matches_kinds(title: str, tag_names: list[str], kinds: list[str]) -> bool:
    hay = f"{title} {' '.join(tag_names)}".lower()
    for kind in kinds:
        if any(token in hay for token in KIND_PATTERNS.get(kind, ())):
            return True
    return False


@router.get("/", response_model=AdvancedSearchResponse)
async def advanced_search(
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.PORTAL_VIEW])
    ],
    db_session: AsyncSession = Depends(get_db),
    title: str | None = Query(default=None),
    entity_type: Literal["folder", "document"] | None = Query(default=None),
    created_from: date | None = Query(default=None),
    created_to: date | None = Query(default=None),
    updated_from: date | None = Query(default=None),
    updated_to: date | None = Query(default=None),
    tag_ids: list[UUID] | None = Query(default=None),
    category_ids: list[UUID] | None = Query(default=None),
    kinds: list[MaterialKind] | None = Query(default=None),
    page_number: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> AdvancedSearchResponse:
    root_id = await portal_dbapi.get_portal_root_id(db_session)
    if root_id is None:
        raise exc.HTTP404NotFound()

    subtree = await portal_dbapi.get_portal_subtree_node_ids(db_session, root_id)
    if not subtree:
        return AdvancedSearchResponse(
            page_size=page_size, page_number=1, num_pages=1, items=[]
        )

    stmt = (
        select(Node)
        .options(selectinload(Node.tags))
        .where(Node.id.in_(subtree), Node.deleted_at.is_(None), Node.id != root_id)
    )
    if title and title.strip():
        stmt = stmt.where(func.lower(Node.title).contains(title.strip().lower()))
    if entity_type:
        stmt = stmt.where(Node.ctype == entity_type)
    if created_from:
        stmt = stmt.where(Node.created_at >= datetime.combine(created_from, time.min))
    if created_to:
        stmt = stmt.where(Node.created_at <= datetime.combine(created_to, time.max))
    if updated_from:
        stmt = stmt.where(Node.updated_at >= datetime.combine(updated_from, time.min))
    if updated_to:
        stmt = stmt.where(Node.updated_at <= datetime.combine(updated_to, time.max))
    if tag_ids:
        stmt = stmt.where(
            exists().where(
                NodeTagsAssociation.node_id == Node.id,
                NodeTagsAssociation.tag_id.in_(tag_ids),
            )
        )
    if category_ids:
        folder_ids = select(cat_orm.CitizenCategoryFolder.node_id).where(
            cat_orm.CitizenCategoryFolder.category_id.in_(category_ids)
        )
        stmt = stmt.where(
            or_(
                Node.id.in_(folder_ids),
                Node.parent_id.in_(folder_ids),
            )
        )

    stmt = stmt.order_by(Node.updated_at.desc())
    nodes = list((await db_session.scalars(stmt)).unique().all())

    visible: list[Node] = []
    for node in nodes:
        if not await can_view_node(db_session, node_id=node.id, user_id=user.id):
            continue
        tag_names = [t.name for t in (node.tags or [])]
        if kinds and not _matches_kinds(node.title, tag_names, list(kinds)):
            continue
        visible.append(node)

    total = len(visible)
    num_pages = max(1, (total + page_size - 1) // page_size) if total else 1
    page_number = min(page_number, num_pages)
    start = (page_number - 1) * page_size
    page = visible[start : start + page_size]

    items = [
        AdvancedSearchItem(
            id=node.id,
            title=node.title,
            ctype=node.ctype,
            created_at=node.created_at,
            updated_at=node.updated_at,
            tags=[t.name for t in (node.tags or [])],
        )
        for node in page
    ]
    return AdvancedSearchResponse(
        page_size=page_size,
        page_number=page_number,
        num_pages=num_pages,
        items=items,
    )
