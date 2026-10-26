from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import orm
from papermerge.core.features.citizen_categories import schema
from papermerge.core.features.citizen_categories.db.orm import (
    CitizenCategory,
    CitizenCategoryFolder,
)
from papermerge.core.features.nodes.visibility import can_view_node


async def _folder_count_map(
    db_session: AsyncSession, category_ids: list[UUID]
) -> dict[UUID, int]:
    if not category_ids:
        return {}
    rows = await db_session.execute(
        select(
            CitizenCategoryFolder.category_id,
            func.count(CitizenCategoryFolder.node_id),
        )
        .where(CitizenCategoryFolder.category_id.in_(category_ids))
        .group_by(CitizenCategoryFolder.category_id)
    )
    return {cid: int(cnt) for cid, cnt in rows.all()}


def _category_out(row: CitizenCategory, folder_count: int) -> schema.CitizenCategoryOut:
    return schema.CitizenCategoryOut(
        id=row.id,
        name=row.name,
        description=row.description,
        sort_order=row.sort_order,
        folder_count=folder_count,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


async def list_categories(
    db_session: AsyncSession,
) -> list[schema.CitizenCategoryOut]:
    rows = (
        await db_session.scalars(
            select(CitizenCategory).order_by(
                CitizenCategory.sort_order, CitizenCategory.name
            )
        )
    ).all()
    counts = await _folder_count_map(db_session, [r.id for r in rows])
    return [_category_out(r, counts.get(r.id, 0)) for r in rows]


async def get_category(
    db_session: AsyncSession, category_id: UUID
) -> schema.CitizenCategoryOut | None:
    row = await db_session.scalar(
        select(CitizenCategory).where(CitizenCategory.id == category_id)
    )
    if row is None:
        return None
    counts = await _folder_count_map(db_session, [row.id])
    return _category_out(row, counts.get(row.id, 0))


async def create_category(
    db_session: AsyncSession, payload: schema.CitizenCategoryCreateIn
) -> tuple[schema.CitizenCategoryOut | None, str | None]:
    row = CitizenCategory(
        name=payload.name.strip(),
        description=payload.description,
        sort_order=payload.sort_order,
    )
    db_session.add(row)
    try:
        await db_session.flush()
    except IntegrityError:
        await db_session.rollback()
        return None, "citizen_category.duplicate_name"
    return _category_out(row, 0), None


async def update_category(
    db_session: AsyncSession,
    category_id: UUID,
    payload: schema.CitizenCategoryUpdateIn,
) -> tuple[schema.CitizenCategoryOut | None, str | None]:
    row = await db_session.scalar(
        select(CitizenCategory).where(CitizenCategory.id == category_id)
    )
    if row is None:
        return None, "not_found"
    if payload.name is not None:
        row.name = payload.name.strip()
    if payload.description is not None:
        row.description = payload.description
    if payload.sort_order is not None:
        row.sort_order = payload.sort_order
    try:
        await db_session.flush()
    except IntegrityError:
        await db_session.rollback()
        return None, "citizen_category.duplicate_name"
    # updated_at uses a server-side onupdate expression; refresh it before
    # building the response so async SQLAlchemy does not try implicit IO.
    await db_session.refresh(row)
    counts = await _folder_count_map(db_session, [row.id])
    return _category_out(row, counts.get(row.id, 0)), None


async def delete_category(db_session: AsyncSession, category_id: UUID) -> bool:
    row = await db_session.scalar(
        select(CitizenCategory).where(CitizenCategory.id == category_id)
    )
    if row is None:
        return False
    await db_session.delete(row)
    return True


async def _ensure_folder_node(
    db_session: AsyncSession, node_id: UUID
) -> orm.Node | None:
    return await db_session.scalar(
        select(orm.Node).where(
            orm.Node.id == node_id,
            orm.Node.ctype == "folder",
            orm.Node.deleted_at.is_(None),
        )
    )


async def list_category_folders(
    db_session: AsyncSession,
    category_id: UUID,
    *,
    user_id: UUID | None,
    public_only: bool = False,
) -> list[schema.CitizenCategoryFolderOut] | None:
    cat = await db_session.scalar(
        select(CitizenCategory).where(CitizenCategory.id == category_id)
    )
    if cat is None:
        return None

    rows = await db_session.execute(
        select(orm.Node.id, orm.Node.title, orm.Node.updated_at)
        .join(
            CitizenCategoryFolder,
            CitizenCategoryFolder.node_id == orm.Node.id,
        )
        .where(
            CitizenCategoryFolder.category_id == category_id,
            orm.Node.deleted_at.is_(None),
            orm.Node.ctype == "folder",
        )
        .order_by(orm.Node.title)
    )

    out: list[schema.CitizenCategoryFolderOut] = []
    for node_id, title, updated_at in rows.all():
        if public_only:
            if not await can_view_node(db_session, node_id=node_id, user_id=None):
                continue
        elif user_id is not None:
            if not await can_view_node(db_session, node_id=node_id, user_id=user_id):
                continue
        out.append(
            schema.CitizenCategoryFolderOut(
                node_id=node_id,
                title=title,
                updated_at=updated_at,
            )
        )
    return out


async def get_folder_categories(
    db_session: AsyncSession, node_id: UUID
) -> list[schema.CitizenCategoryOut] | None:
    folder = await _ensure_folder_node(db_session, node_id)
    if folder is None:
        return None

    rows = (
        await db_session.scalars(
            select(CitizenCategory)
            .join(
                CitizenCategoryFolder,
                CitizenCategoryFolder.category_id == CitizenCategory.id,
            )
            .where(CitizenCategoryFolder.node_id == node_id)
            .order_by(CitizenCategory.sort_order, CitizenCategory.name)
        )
    ).all()
    counts = await _folder_count_map(db_session, [r.id for r in rows])
    return [_category_out(r, counts.get(r.id, 0)) for r in rows]


async def set_folder_categories(
    db_session: AsyncSession,
    node_id: UUID,
    category_ids: list[UUID],
) -> tuple[list[schema.CitizenCategoryOut] | None, str | None]:
    folder = await _ensure_folder_node(db_session, node_id)
    if folder is None:
        return None, "not_found"

    unique_ids = list(dict.fromkeys(category_ids))
    if unique_ids:
        found = (
            await db_session.scalars(
                select(CitizenCategory.id).where(
                    CitizenCategory.id.in_(unique_ids)
                )
            )
        ).all()
        if len(found) != len(unique_ids):
            return None, "citizen_category.invalid_category"

    await db_session.execute(
        delete(CitizenCategoryFolder).where(
            CitizenCategoryFolder.node_id == node_id
        )
    )
    for cid in unique_ids:
        db_session.add(CitizenCategoryFolder(category_id=cid, node_id=node_id))
    await db_session.flush()
    return await get_folder_categories(db_session, node_id), None
