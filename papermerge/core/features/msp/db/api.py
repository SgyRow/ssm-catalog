"""Database API for the МСП (Measures of Social Support) feature."""
from __future__ import annotations

import uuid
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from papermerge.core.features.msp import folder_template
from papermerge.core.features.msp.db import orm
from papermerge.core.features.msp.htmlutil import is_empty_body, sanitize_msp_html
from papermerge.core.features.msp.schema import (
    MspSectionInput,
    NewMspType,
)
from papermerge.core.features.nodes.db import orm as nodes_orm
from papermerge.core.features.nodes.db.api import (
    create_folder as nodes_create_folder,
    hard_delete_subtree,
)
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


async def update_msp_type(
    db_session: AsyncSession,
    msp_type_id: UUID,
    *,
    name: str | None = None,
    description: str | None = None,
    sections: list | None = None,
) -> orm.MspType | None:
    """Update a measure type, optionally replacing its section list.

    ``sections`` is the full ordered list. Existing ids are renamed and
    reordered; missing ids are deleted; items without an id are created.
    Measure instances keep their own section bodies; titles of still-linked
    sections follow the type when renamed.
    """
    msp_type = await get_msp_type(db_session, msp_type_id)
    if msp_type is None:
        return None

    if name is not None and name.strip():
        msp_type.name = name.strip()
    if description is not None:
        stripped = description.strip()
        msp_type.description = stripped or None

    if sections is not None:
        existing = {s.id: s for s in msp_type.sections}
        kept_ids: set[UUID] = set()
        new_rows: list[orm.MspTypeSection] = []
        for i, item in enumerate(sections):
            title = item.title.strip()
            if not title:
                continue
            sid = item.id
            if sid is not None and sid in existing:
                section = existing[sid]
                if section.title != title:
                    section.title = title
                    stmt = (
                        update(orm.MspSection)
                        .where(orm.MspSection.type_section_id == section.id)
                        .values(title=title)
                    )
                    await db_session.execute(stmt)
                section.sort_order = i
                kept_ids.add(sid)
            else:
                new_rows.append(
                    orm.MspTypeSection(
                        msp_type_id=msp_type.id,
                        title=title,
                        sort_order=i,
                    )
                )
        for section in list(msp_type.sections):
            if section.id not in kept_ids:
                msp_type.sections.remove(section)
        msp_type.sections.extend(new_rows)

    await db_session.commit()
    db_session.expire(msp_type)
    return await get_msp_type(db_session, msp_type_id)


async def add_msp_type_section(
    db_session: AsyncSession,
    msp_type_id: UUID,
    title: str,
    index: int | None = None,
) -> orm.MspTypeSection | None:
    """Add a section to a measure type at an arbitrary position.

    ``index`` is the zero-based insertion position in the current ordered
    list (0 = first); when omitted or out of range the section is appended
    at the end. After the insertion ``sort_order`` is renumbered 0..N.
    """
    msp_type = await get_msp_type(db_session, msp_type_id)
    if msp_type is None:
        return None
    sections = sorted(msp_type.sections, key=lambda s: s.sort_order)
    insert_at = max(0, min(index, len(sections))) if index is not None else len(sections)
    section = orm.MspTypeSection(
        msp_type_id=msp_type_id, title=title.strip(), sort_order=insert_at
    )
    db_session.add(section)
    sections = sections[:insert_at] + [section] + sections[insert_at:]
    for i, s in enumerate(sections):
        s.sort_order = i
    await db_session.commit()
    return section


async def reorder_msp_type_sections(
    db_session: AsyncSession, msp_type_id: UUID, order: list[UUID]
) -> orm.MspType | None:
    """Move sections within a type: ``order`` is the full new id order.

    Raises ``ValueError`` when the list is not exactly the type's set of
    sections (duplicates, unknown ids, or a missing id).
    """
    msp_type = await get_msp_type(db_session, msp_type_id)
    if msp_type is None:
        return None
    sections_by_id = {s.id: s for s in msp_type.sections}
    if set(order) != set(sections_by_id) or len(order) != len(sections_by_id):
        raise ValueError(
            "order must contain each section of the type exactly once"
        )
    for i, section_id in enumerate(order):
        sections_by_id[section_id].sort_order = i
    await db_session.commit()
    return await get_msp_type(db_session, msp_type_id)


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

    Titles come from the type's section definitions unless the input supplies
    its own ``title`` — then the section is renamed for this measure only
    (the type is not touched). A snapshot of the title is stored on the
    section so a measure keeps rendering even if the type changes.

    ``hidden`` is passed through: hidden sections keep their text but are
    not rendered in the measure view or PDF.
    """
    type_sections = {ts.id: ts for ts in msp_type.sections}
    type_sections_by_title = {ts.title: ts for ts in msp_type.sections}

    result: list[orm.MspSection] = []
    for i, inp in enumerate(inputs):
        body = sanitize_msp_html((inp.body or "").strip())
        if is_empty_body(body):
            # Empty section = "not needed" — do not store it.
            continue
        ts = None
        if inp.type_section_id is not None:
            ts = type_sections.get(inp.type_section_id)
        if ts is None:
            ts = type_sections_by_title.get(inp.title)
        # A non-empty input title renames the section for this measure only;
        # otherwise the type section title is used (snapshot).
        title = inp.title.strip() or (ts.title if ts is not None else "")
        sort_order = ts.sort_order if ts is not None else i
        result.append(
            orm.MspSection(
                title=title,
                body=body,
                hidden=inp.hidden,
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

    # Standard folders inside the measure folder (idempotent tree; the
    # transaction is committed together with the measure below).
    await folder_template.create_default_msp_folders(
        db_session, parent_id=folder.id
    )

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

    # Delete the measure first (ORM cascades to its sections), then the
    # anchor folder together with everything inside it (standard subfolders
    # and documents). Deleting the node first would trigger the DB-level
    # ON DELETE CASCADE on msps.node_id and leave the ORM to delete an already
    # gone row.
    await db_session.delete(msp)

    await hard_delete_subtree(db_session, msp.node_id)

    await db_session.commit()
