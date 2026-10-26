"""Standardized folder tree for a social support measure (МСП) card."""

from __future__ import annotations

import uuid
from typing import TypeAlias
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from papermerge.core import orm, schema
from papermerge.core.features.nodes.db import api as nodes_dbapi

FolderSpec: TypeAlias = tuple[str, list["FolderSpec"]]

ERR_DUPLICATE_TITLE = "msp_template.duplicate_title"
ERR_ROOT_NOT_EMPTY = "msp_template.root_not_empty"

MSP_FOLDER_TEMPLATE: list[FolderSpec] = [
    (
        "1. Прием документов",
        [
            (
                "Нормативно-правовые документы",
                [
                    ("Федеральные", []),
                    ("Региональные", []),
                    ("Консультационные письма МСЗ", []),
                    ("Нормативы", []),
                    ("Прожиточный минимум", []),
                ],
            ),
            (
                "Необходимые документы",[],
            ),
        ],
    ),
    (
        "2. Назначение",
        [
            (
                "Основания для приостановления, прекращения выплаты",[],
            ),
        ],
    ),
    (
        "3. Информационный материал",
        [
            (
                "Бланки заявлений (заявление, заявление на обработку персональных данных, образец заполнения)",
                [],
            ),
            ("На стенды", []),
            ("Раздаточный материал", []),
            ("Видеоматериал", []),
            ("Методические пособия", []),
        ],
    ),
]

MSP_TOP_LEVEL_TITLES = frozenset(title for title, _ in MSP_FOLDER_TEMPLATE)


def _error_from_exception(exc: Exception) -> schema.Error:
    if isinstance(exc, IntegrityError):
        lowered = str(exc).lower()
        if "unique" in lowered and "title" in lowered:
            return schema.Error(messages=[ERR_DUPLICATE_TITLE])
    return schema.Error(messages=[str(exc)])


async def _ownership_for_parent(
    db_session: AsyncSession, parent_id: UUID
) -> tuple[UUID | None, UUID | None]:
    row = (
        await db_session.execute(
            select(orm.Node.user_id, orm.Node.group_id).where(
                orm.Node.id == parent_id
            )
        )
    ).fetchone()
    if row is None:
        raise ValueError(f"Parent folder {parent_id} not found")
    return row


async def _child_titles(db_session: AsyncSession, parent_id: UUID) -> set[str]:
    stmt = select(orm.Folder.title).where(
        orm.Folder.parent_id == parent_id,
        orm.Folder.ctype == "folder",
        orm.Folder.deleted_at.is_(None),
    )
    return set((await db_session.scalars(stmt)).all())


def _root_has_foreign_children(child_titles: set[str]) -> bool:
    if not child_titles:
        return False
    return not bool(child_titles & MSP_TOP_LEVEL_TITLES)


async def _create_folder(
    db_session: AsyncSession,
    *,
    parent_id: UUID,
    title: str,
    user_id: UUID | None,
    group_id: UUID | None,
) -> UUID:
    folder_id = uuid.uuid4()
    folder = orm.Folder(
        id=folder_id,
        user_id=user_id,
        group_id=group_id,
        title=title,
        parent_id=parent_id,
        ctype="folder",
    )
    db_session.add(folder)
    await db_session.flush()
    return folder_id


async def _get_or_create_folder(
    db_session: AsyncSession,
    *,
    parent_id: UUID,
    title: str,
    user_id: UUID | None,
    group_id: UUID | None,
    folder_ids: list[UUID],
) -> UUID:
    existing = await nodes_dbapi.find_folder_id_by_title(
        db_session,
        parent_id=parent_id,
        title=title,
        user_id=user_id,
        group_id=group_id,
        trashed=False,
    )
    if existing is not None:
        if existing not in folder_ids:
            folder_ids.append(existing)
        return existing

    trashed = await nodes_dbapi.find_folder_id_by_title(
        db_session,
        parent_id=parent_id,
        title=title,
        user_id=user_id,
        group_id=group_id,
        trashed=True,
    )
    if trashed is not None:
        await nodes_dbapi.revive_trashed_node(db_session, trashed)
        if trashed not in folder_ids:
            folder_ids.append(trashed)
        return trashed

    folder_id = await _create_folder(
        db_session,
        parent_id=parent_id,
        title=title,
        user_id=user_id,
        group_id=group_id,
    )
    folder_ids.append(folder_id)
    return folder_id


async def _ensure_subtree(
    db_session: AsyncSession,
    *,
    parent_id: UUID,
    nodes: list[FolderSpec],
    user_id: UUID | None,
    group_id: UUID | None,
    folder_ids: list[UUID],
) -> None:
    for title, children in nodes:
        folder_id = await _get_or_create_folder(
            db_session,
            parent_id=parent_id,
            title=title,
            user_id=user_id,
            group_id=group_id,
            folder_ids=folder_ids,
        )
        if children:
            await _ensure_subtree(
                db_session,
                parent_id=folder_id,
                nodes=children,
                user_id=user_id,
                group_id=group_id,
                folder_ids=folder_ids,
            )


async def create_msp_folder_tree(
    db_session: AsyncSession,
    *,
    parent_id: UUID,
    title: str,
) -> tuple[schema.Folder | None, list[UUID], schema.Error | None]:
    """Create or complete the standard МСП subtree under ``parent_id``.

    Idempotent: re-running with the same root title completes any missing
    template folders instead of failing on duplicate names. Soft-deleted
    folders with matching titles are restored from trash.

    Does not commit — the caller owns the transaction.
    """
    folder_ids: list[UUID] = []
    root_id: UUID | None = None
    try:
        user_id, group_id = await _ownership_for_parent(db_session, parent_id)
        root_id = await _get_or_create_folder(
            db_session,
            parent_id=parent_id,
            title=title,
            user_id=user_id,
            group_id=group_id,
            folder_ids=folder_ids,
        )

        child_titles = await _child_titles(db_session, root_id)
        if _root_has_foreign_children(child_titles):
            return None, [], schema.Error(messages=[ERR_ROOT_NOT_EMPTY])

        await _ensure_subtree(
            db_session,
            parent_id=root_id,
            nodes=MSP_FOLDER_TEMPLATE,
            user_id=user_id,
            group_id=group_id,
            folder_ids=folder_ids,
        )
    except Exception as exc:
        await db_session.rollback()
        return None, [], _error_from_exception(exc)

    stmt = (
        select(orm.Folder)
        .options(selectinload(orm.Folder.tags))
        .where(orm.Folder.id == root_id)
    )
    folder = (await db_session.scalars(stmt)).one()
    return schema.Folder.model_validate(folder), folder_ids, None
