"""Standard folders created inside a measure (МСП) folder on creation.

Only informational materials are created as real folders:

- "Информационные материалы" → "Бланки заявлений", "На стенды",
  "Раздаточные материалы", "Видеоматериалы", "Методические пособия".

Normative acts are virtual (msp_normative_folders + links to the central
registry) and are no longer mirrored as child folders of the measure.
"""

from __future__ import annotations

import uuid
from typing import TypeAlias
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core.features.nodes.db import orm as nodes_orm
from papermerge.core.features.nodes.db.node_titles import next_sort_index

FolderSpec: TypeAlias = tuple[str, list["FolderSpec"]]

# Kept for UI matching of older measures that still have this physical folder.
NORMATIVE_FOLDER = "Нормативные правовые документы"
INFORMATION_FOLDER = "Информационные материалы"

# Central registry at the portal root: real NPA documents live here.
NORMATIVE_REGISTRY_FOLDER = "Нормативные правовые акты"
# Previous root titles still recognized so ensure_* can rename them.
NORMATIVE_REGISTRY_FOLDER_LEGACY: tuple[str, ...] = (
    "Нормативно-правовые акты",
    "Нормативные правовые документы",
)
NORMATIVE_BUCKET_FEDERAL = "Федеральные"
NORMATIVE_BUCKET_REGIONAL = "Региональные"
NORMATIVE_BUCKETS: tuple[str, ...] = (
    NORMATIVE_BUCKET_FEDERAL,
    NORMATIVE_BUCKET_REGIONAL,
)

MSP_DEFAULT_FOLDERS: list[FolderSpec] = [
    (
        INFORMATION_FOLDER,
        [
            ("Бланки заявлений", []),
            ("На стенды", []),
            ("Раздаточные материалы", []),
            ("Видеоматериалы", []),
            ("Методические пособия", []),
        ],
    ),
]


async def create_default_msp_folders(
    db_session: AsyncSession, *, parent_id: UUID
) -> list[UUID]:
    """Create the standard folder template under ``parent_id``.

    ``parent_id`` must be an existing node (the measure's anchor folder).
    Ownership is copied from the parent node.

    Does not commit — the caller owns the transaction.
    Returns all created folder ids (top folder first, then its children).
    """
    row = (
        await db_session.execute(
            select(nodes_orm.Node.user_id, nodes_orm.Node.group_id).where(
                nodes_orm.Node.id == parent_id
            )
        )
    ).fetchone()
    user_id, group_id = row

    created: list[UUID] = []

    async def add_folder(parent: UUID, title: str) -> UUID:
        folder_id = uuid.uuid4()
        folder = nodes_orm.Folder(
            id=folder_id,
            user_id=user_id,
            group_id=group_id,
            title=title,
            parent_id=parent,
            ctype="folder",
            sort_index=await next_sort_index(db_session, parent),
        )
        db_session.add(folder)
        await db_session.flush()
        created.append(folder_id)
        return folder_id

    for title, children in MSP_DEFAULT_FOLDERS:
        folder_id = await add_folder(parent_id, title)
        for child_title, _ in children:
            await add_folder(folder_id, child_title)

    return created
