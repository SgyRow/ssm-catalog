"""Database API for the МСП (Measures of Social Support) feature."""
from __future__ import annotations

import uuid
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from papermerge.core.features.msp.db import orm
from papermerge.core.features.msp.schema import (
    MspSectionInput,
    NewMspType,
)
from papermerge.core.features.nodes.db import orm as nodes_orm
from papermerge.core.features.nodes.db.api import create_folder as nodes_create_folder
from papermerge.core.features.nodes.schema import NewFolder
from papermerge.core.schemas.error import Error


# --------------------------------------------------------------------------- #
# Types (виды МСП)
# --------------------------------------------------------------------------- #
async def create_msp_type(
    db_session: AsyncSession, attrs: NewMspType
) -> orm.MspType:
    msp_type = orm.MspType(name=attrs.name, description=attrs.description)
    db_session.add(msp_type)
    await db_session.flush()
    for i, section in enumerate(attrs.sections):
        db_session.add(
            orm.MspTypeSection(
                msp_type_id=msp_type.id,
                title=section.title,
                sort_order=i,
            )
        )
    await db_session.commit()
    return await get_msp_type(db_session, msp_type.id)


async def list_msp_types(db_session: AsyncSession) -> list[orm.MspType]:
    stmt = (
        select(orm.MspType)
        .options(selectinload(orm.MspType.sections))
        .order_by(orm.MspType.name)
    )
    return list((await db_session.execute(stmt)).scalars().all())


async def get_msp_type(
    db_session: AsyncSession, msp_type_id: UUID
) -> orm.MspType | None:
    stmt = (
        select(orm.MspType)
        .options(selectinload(orm.MspType.sections))
        .where(orm.MspType.id == msp_type_id)
    )
    return (await db_session.execute(stmt)).scalar_one_or_none()


async def add_msp_type_section(
    db_session: AsyncSession, msp_type_id: UUID, title: str
) -> orm.MspTypeSection | None:
    msp_type = await get_msp_type(db_session, msp_type_id)
    if msp_type is None:
        return None
    stmt = (
        select(orm.MspTypeSection.sort_order)
        .where(orm.MspTypeSection.msp_type_id == msp_type_id)
        .order_by(orm.MspTypeSection.sort_order.desc())
        .limit(1)
    )
    last = (await db_session.execute(stmt)).scalar_one_or_none()
    # Single-column select → the value itself (an int), not a row.
    sort_order = (last + 1) if last is not None else 0
    section = orm.MspTypeSection(
        msp_type_id=msp_type_id, title=title, sort_order=sort_order
    )
    db_session.add(section)
    await db_session.commit()
    return section


async def delete_msp_type(db_session: AsyncSession, msp_type_id: UUID) -> None:
    msp_type = await db_session.get(orm.MspType, msp_type_id)
    if msp_type is None:
        return
    await db_session.delete(msp_type)
    await db_session.commit()


# --------------------------------------------------------------------------- #
# Measures (меры МСП)
# --------------------------------------------------------------------------- #
async def _sections_from_inputs(
    db_session: AsyncSession,
    msp_type: orm.MspType,
    inputs: list[MspSectionInput],
) -> list[orm.MspSection]:
    """Build MspSection rows (non-empty only) from the supplied inputs.

    Titles come from the type's section definitions; a snapshot of the title is
    stored on the section so a measure keeps rendering even if the type changes.
    """
    type_sections = {ts.id: ts for ts in msp_type.sections}
    type_sections_by_title = {ts.title: ts for ts in msp_type.sections}

    result: list[orm.MspSection] = []
    for i, inp in enumerate(inputs):
        body = (inp.body or "").strip()
        if not body:
            # Empty section = "not needed" — do not store it.
            continue
        ts = None
        if inp.type_section_id is not None:
            ts = type_sections.get(inp.type_section_id)
        if ts is None:
            ts = type_sections_by_title.get(inp.title)
        title = ts.title if ts is not None else inp.title
        sort_order = ts.sort_order if ts is not None else i
        result.append(
            orm.MspSection(
                title=title,
                body=body,
                sort_order=sort_order,
                type_section_id=ts.id if ts is not None else None,
            )
        )
    return result


async def create_msp(
    db_session: AsyncSession,
    *,
    parent_id: UUID,
    title: str,
    msp_type_id: UUID,
    sections: list[MspSectionInput],
) -> tuple[orm.Msp | None, UUID | None, Error | None]:
    """Create a measure: a folder node (anchor) + the measure + its sections."""
    msp_type = await get_msp_type(db_session, msp_type_id)
    if msp_type is None:
        return None, None, Error(messages=["Measure type not found"])

    folder, _ = await nodes_create_folder(
        db_session,
        NewFolder(title=title, ctype="folder", parent_id=parent_id),
    )
    if folder is None:
        return None, None, Error(messages=["Could not create the folder node"])

    msp = orm.Msp(node_id=folder.id, msp_type_id=msp_type_id)
    db_session.add(msp)
    await db_session.flush()

    # The measure is brand new, so attach sections by FK (extending the not-yet
    # loaded relationship would trigger a lazy load).
    for section in await _sections_from_inputs(db_session, msp_type, sections):
        section.msp_id = msp.id
        db_session.add(section)

    await db_session.commit()
    created = await get_msp(db_session, msp.id)
    return created, folder.id, None


async def list_msps(db_session: AsyncSession) -> list[orm.Msp]:
    stmt = (
        select(orm.Msp)
        .options(
            selectinload(orm.Msp.msp_type),
            selectinload(orm.Msp.sections),
        )
        .order_by(orm.Msp.created_at)
    )
    return list((await db_session.execute(stmt)).scalars().all())


async def get_msp(db_session: AsyncSession, msp_id: UUID) -> orm.Msp | None:
    stmt = (
        select(orm.Msp)
        .options(
            selectinload(orm.Msp.msp_type),
            selectinload(orm.Msp.sections),
        )
        .where(orm.Msp.id == msp_id)
    )
    return (await db_session.execute(stmt)).scalar_one_or_none()


async def get_msp_by_node(
    db_session: AsyncSession, node_id: UUID
) -> orm.Msp | None:
    stmt = (
        select(orm.Msp)
        .options(
            selectinload(orm.Msp.msp_type),
            selectinload(orm.Msp.sections),
        )
        .where(orm.Msp.node_id == node_id)
    )
    return (await db_session.execute(stmt)).scalar_one_or_none()


async def update_msp(
    db_session: AsyncSession,
    *,
    msp_id: UUID,
    title: str | None = None,
    sections: list[MspSectionInput] | None = None,
) -> orm.Msp | None:
    msp = await get_msp(db_session, msp_id)
    if msp is None:
        return None

    if sections is not None:
        msp_type = await get_msp_type(db_session, msp.msp_type_id)
        new_sections = await _sections_from_inputs(db_session, msp_type, sections)
        # Replace the sections through the relationship so the ORM stays
        # consistent: dropping from the collection deletes (delete-orphan),
        # attaching sets the FK and registers the new rows.
        for section in list(msp.sections):
            msp.sections.remove(section)
        msp.sections.extend(new_sections)

    if title is not None and title.strip():
        stmt = (
            update(nodes_orm.Node)
            .where(nodes_orm.Node.id == msp.node_id)
            .values(title=title)
        )
        await db_session.execute(stmt)

    await db_session.commit()
    # The session is configured with expire_on_commit=False, so force a clean
    # reload of the (possibly mutated) relationships before returning.
    db_session.expire(msp)
    return await get_msp(db_session, msp_id)


async def delete_msp(db_session: AsyncSession, msp_id: UUID) -> None:
    msp = await get_msp(db_session, msp_id)
    if msp is None:
        return

    # Delete the measure first (ORM cascades to its sections), then the anchor
    # folder node. Deleting the node first would trigger the DB-level
    # ON DELETE CASCADE on msps.node_id and leave the ORM to delete an already
    # gone row.
    await db_session.delete(msp)

    node = await db_session.get(nodes_orm.Folder, msp.node_id)
    if node is not None:
        await db_session.delete(node)

    await db_session.commit()
