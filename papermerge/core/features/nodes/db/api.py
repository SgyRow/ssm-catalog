import logging
import uuid
import math
from datetime import datetime
from typing import Union, Tuple, Iterable
from uuid import UUID

from sqlalchemy import func, literal, select, delete, update, exists, or_
from sqlalchemy.orm import selectin_polymorphic, selectinload
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core.exceptions import EntityNotFound
from papermerge.core.db.common import get_ancestors, get_descendants
from papermerge.core import schema
from papermerge.core.types import PaginatedResponse
from papermerge.core.features.nodes import events
from papermerge.core.features.nodes.schema import DeleteDocumentsData
from papermerge.core import orm
from papermerge.core.features.library_ts.db import api as lib_ts_api
from papermerge.core.features.tags.db.api import _user_group_ids_subquery
from papermerge.core.features.users.db import api as users_dbapi
from papermerge.core.features.tags.db import api as tags_dbapi
from .orm import Folder

logger = logging.getLogger(__name__)

async def load_node(db_session: AsyncSession, node: orm.Node) -> orm.Document | orm.Folder:
    if node.ctype == 'document':
        stmt = select(orm.Document).options(
            selectinload(orm.Document.versions).selectinload(orm.DocumentVersion.pages)
        ).where(orm.Document.id == node.id)
        result =  await db_session.execute(stmt)
        return result.scalar_one()

    stmt = select(orm.Folder).where(orm.Folder.id == node.id)
    result = await db_session.execute(stmt)
    return result.scalar_one()


async def load_folder(db_session: AsyncSession, folder: orm.Folder) -> orm.Folder:
    stmt = select(orm.Folder).options(
        selectinload(orm.Folder.tags)
    ).where(orm.Folder.id == folder.id)
    result = await db_session.execute(stmt)
    return result.scalar_one()


from .node_titles import (
    find_folder_id_by_title,
    find_node_id_by_title,
    next_sort_index,
    node_ownership_filter,
    revive_trashed_node,
)


def _folder_ownership_filter(stmt, user_id: UUID | None, group_id: UUID | None):
    return node_ownership_filter(stmt, user_id, group_id)


async def _trash_visibility_filter(db_session: AsyncSession, user_id: UUID):
    """Nodes in trash the user may see: owned, group-owned, or portal-managed."""
    from papermerge.core.db.common import _user_has_any_portal_perm_via_account_roles
    from papermerge.core.features.auth import scopes as auth_scopes
    from papermerge.core.features.portal.db import api as portal_dbapi

    user_group_subq = _user_group_ids_subquery(user_id)
    clauses = [
        orm.Node.user_id == user_id,
        orm.Node.group_id.in_(user_group_subq),
    ]
    root_id = await portal_dbapi.get_portal_root_id(db_session)
    if root_id is not None and await _user_has_any_portal_perm_via_account_roles(
        db_session,
        user_id,
        auth_scopes.PORTAL_VIEW,
        auth_scopes.PORTAL_DOCUMENT_DELETE,
        auth_scopes.PORTAL_SECTION_DELETE,
        auth_scopes.PORTAL_DOCUMENT_UPDATE,
        auth_scopes.PORTAL_SECTION_UPDATE,
    ):
        portal_ids = await portal_dbapi.get_portal_subtree_node_ids(
            db_session, root_id
        )
        if portal_ids:
            clauses.append(orm.Node.id.in_(portal_ids))
    return or_(*clauses)


async def _user_can_manage_trashed_node(
    db_session: AsyncSession, node: orm.Node, user_id: UUID
) -> bool:
    if node.deleted_at is None:
        return False
    user = await db_session.get(orm.User, user_id)
    if user is not None and user.is_superuser:
        return True
    if node.user_id == user_id:
        return True
    if node.group_id is not None and await users_dbapi.user_belongs_to(
        db_session, group_id=node.group_id, user_id=user_id
    ):
        return True
    from papermerge.core.db.common import _user_has_any_portal_perm_via_account_roles
    from papermerge.core.features.auth import scopes as auth_scopes
    from papermerge.core.features.portal.db import api as portal_dbapi

    root_id = await portal_dbapi.get_portal_root_id(db_session)
    if root_id is None or not await portal_dbapi.is_node_under_portal_root(
        db_session, node.id, root_id
    ):
        return False
    if node.ctype == "folder":
        return await _user_has_any_portal_perm_via_account_roles(
            db_session, user_id, auth_scopes.PORTAL_SECTION_DELETE
        )
    return await _user_has_any_portal_perm_via_account_roles(
        db_session, user_id, auth_scopes.PORTAL_DOCUMENT_DELETE
    )


def _node_file_extension_expr():
    """Lower-case file extension from title; nodes without one sort as empty."""
    return func.lower(
        func.coalesce(
            func.substring(orm.Node.title, r"\.([^.]+)$"),
            literal(""),
        )
    )


def str2colexpr(keys: list[str]):
    result = []
    file_ext = _node_file_extension_expr()
    ORDER_BY_MAP = {
        "ctype": orm.Node.ctype,
        "-ctype": orm.Node.ctype.desc(),
        "file_type": (file_ext.asc(), orm.Node.title.asc()),
        "-file_type": (file_ext.desc(), orm.Node.title.desc()),
        "title": orm.Node.title,
        "-title": orm.Node.title.desc(),
        "created_at": orm.Node.created_at,
        "-created_at": orm.Node.created_at.desc(),
        "updated_at": orm.Node.updated_at,
        "-updated_at": orm.Node.updated_at.desc(),
        "sort_index": (orm.Node.sort_index.asc(), orm.Node.title.asc()),
        "-sort_index": (orm.Node.sort_index.desc(), orm.Node.title.desc()),
    }
    logger.debug(f"str2colexpr keys = {keys}")

    for key in keys:
        item = ORDER_BY_MAP.get(key, orm.Node.title)
        if isinstance(item, tuple):
            result.extend(item)
        else:
            result.append(item)

    return result


async def get_nodes(
    db_session: AsyncSession, user_id: UUID | None = None, node_ids: list[UUID] | None = None
) -> list[schema.Document | schema.Folder]:
    items = []
    if node_ids is None:
        node_ids = []

    if len(node_ids) > 0:
        stmt = (
            select(orm.Node)
            .options(selectinload(orm.Node.tags))
            .filter(orm.Node.id.in_(node_ids))
        )
    else:
        stmt = select(orm.Node).options(selectinload(orm.Node.tags))

    if user_id is not None:
        stmt = stmt.filter(orm.Node.user_id == user_id)
    stmt = stmt.where(orm.Node.deleted_at.is_(None))

    nodes = (await db_session.scalars(stmt)).all()

    for node in nodes:
        breadcrumb = await get_ancestors(db_session, node.id, include_self=False)
        node = await load_node(db_session, node)
        node.breadcrumb = breadcrumb
        if node.ctype == "folder":
            items.append(schema.Folder.model_validate(node))
        else:
            items.append(schema.Document.model_validate(node))

    return items


async def get_folder_by_id(db_session: AsyncSession, id: uuid.UUID) -> schema.Folder:
    stmt = select(Folder).where(Folder.id == id)
    db_folder = (await db_session.scalars(stmt)).one_or_none()
    return schema.Folder.model_validate(db_folder)


async def get_paginated_nodes(
    db_session: AsyncSession,
    parent_id: UUID,
    user_id: UUID | None,
    page_size: int,
    page_number: int,
    order_by: list[str],
    filter: str | None = None,
) -> PaginatedResponse[Union[schema.Document, schema.Folder]]:
    from papermerge.core.features.nodes.db import visibility_api as vis_dbapi
    from papermerge.core.features.nodes.visibility import can_view_node

    loader_opt = selectin_polymorphic(orm.Node, [Folder, orm.Document])
    subq = exists().where(orm.SharedNode.node_id == orm.Node.id)
    if filter:
        query = (
            select(orm.Node, subq.label("is_shared"))
            .options(selectinload(orm.Node.tags))
            .filter(
                func.lower(orm.Node.title).contains(
                    filter.strip().lower(), autoescape=True
                )
            )
            .filter_by(parent_id=parent_id)
            .where(orm.Node.deleted_at.is_(None))
        )
    else:
        query = (
            select(orm.Node, subq.label("is_shared"))
            .options(selectinload(orm.Node.tags))
            .filter_by(parent_id=parent_id)
            .where(orm.Node.deleted_at.is_(None))
        )

    query = query.order_by(*str2colexpr(order_by)).options(loader_opt)
    rows = (await db_session.execute(query)).all()

    visible_rows = []
    for row in rows:
        node = row.Node
        if await can_view_node(db_session, node_id=node.id, user_id=user_id):
            visible_rows.append(row)

    total_nodes = len(visible_rows)
    num_pages = max(1, math.ceil(total_nodes / page_size)) if total_nodes else 0
    start = (page_number - 1) * page_size
    page_rows = visible_rows[start : start + page_size]

    items = []
    for row in page_rows:
        node = row.Node
        node.is_shared = row.is_shared
        vis_summary = await vis_dbapi.visibility_summary_for_node(
            db_session, node.id
        )
        if node.ctype == "folder":
            folder = schema.Folder.model_validate(node)
            folder.visibility_summary = vis_summary
            items.append(folder)
        else:
            doc = schema.DocumentNode.model_validate(node)
            doc.visibility_summary = vis_summary
            items.append(doc)

    return PaginatedResponse[Union[schema.DocumentNode, schema.Folder]](
        page_size=page_size,
        page_number=page_number,
        num_pages=num_pages,
        items=items,
    )


async def update_node(
    db_session: AsyncSession,
    node_id: uuid.UUID,
    user_id: uuid.UUID,
    attrs: schema.UpdateNode,
) -> schema.Node:
    stmt = select(orm.Node).where(orm.Node.id == node_id)
    node = (await db_session.scalars(stmt)).one()
    if attrs.title is not None:
        node.title = attrs.title

    if attrs.parent_id is not None:
        node.parent_id = attrs.parent_id

    await db_session.commit()
    node = await load_node(db_session, node)
    return schema.Node.model_validate(node)


async def create_folder(
    db_session: AsyncSession, attrs: schema.NewFolder
) -> Tuple[schema.Folder | None, schema.Error | None]:
    error = None
    folder_id = attrs.id or uuid.uuid4()

    stmt = select(orm.Node.user_id, orm.Node.group_id).where(
        orm.Node.id == attrs.parent_id
    )
    user_id, group_id = (await db_session.execute(stmt)).fetchone()

    trashed_id = await find_folder_id_by_title(
        db_session,
        parent_id=attrs.parent_id,
        title=attrs.title,
        user_id=user_id,
        group_id=group_id,
        trashed=True,
    )
    if trashed_id is not None:
        await revive_trashed_node(db_session, trashed_id)
        folder = (
            await db_session.scalars(
                select(orm.Folder).where(orm.Folder.id == trashed_id)
            )
        ).one()
        folder = await load_folder(db_session, folder)
        await db_session.commit()
        return schema.Folder.model_validate(folder), None

    folder = orm.Folder(
        id=folder_id,
        user_id=user_id,
        group_id=group_id,
        title=attrs.title,
        parent_id=attrs.parent_id,
        ctype="folder",
        sort_index=await next_sort_index(db_session, attrs.parent_id),
    )
    db_session.add(folder)
    try:
        await db_session.commit()
    except IntegrityError as e:
        error = schema.Error(messages=[str(e)])
        folder = None
    except Exception as e:
        error = schema.Error(messages=[str(e)])
        folder = None

    if folder:
        folder = await load_folder(db_session, folder)
        return schema.Folder.model_validate(folder), error

    return None, error


async def assign_node_tags(
    db_session: AsyncSession, node_id: uuid.UUID, tags: list[str], user_id: uuid.UUID
) -> Tuple[schema.Document | schema.Folder | None, schema.Error | None]:
    """Will assign tags with given name to the node

    Currently associated node tags not mentioned in the `tags` list will
    be disassociated (but tags won't be deleted).
    """
    error = None

    stmt = select(orm.Node).where(orm.Node.id == node_id)
    node = (await db_session.scalars(stmt)).one_or_none()

    if node is None:
        raise EntityNotFound(f"Node {node_id} not found")

    tag_objs = []
    for name in tags:
        tag = await tags_dbapi.find_catalog_tag_by_name(
            db_session, user_id=user_id, name=name
        )
        if tag is None:
            return None, schema.Error(messages=[f"Unknown tag: {name}"])
        tag_objs.append(tag)

    try:
        node.tags = tag_objs
        await db_session.commit()
    except Exception as e:
        error = schema.Error(messages=[str(e)])
        return None, error

    node = await load_node(db_session, node)
    if node.ctype == "document":
        return schema.Document.model_validate(node), error

    return schema.Folder.model_validate(node), error


async def update_node_tags(
    db_session: AsyncSession, node_id: uuid.UUID, tags: list[str], user_id: uuid.UUID
) -> Tuple[schema.Document | schema.Folder | None, schema.Error | None]:
    error = None

    stmt = select(orm.Node).where(orm.Node.id == node_id)
    node = (await db_session.scalars(stmt)).one_or_none()

    if node is None:
        raise EntityNotFound(f"Node {node_id} not found")

    db_tags = []
    for name in tags:
        tag = await tags_dbapi.find_catalog_tag_by_name(
            db_session, user_id=user_id, name=name
        )
        if tag is None:
            return None, schema.Error(messages=[f"Unknown tag: {name}"])
        db_tags.append(tag)

    db_session.add_all(db_tags)

    try:
        await db_session.commit()
        node.tags.extend(db_tags)
        await db_session.commit()
    except Exception as e:
        error = schema.Error(messages=[str(e)])
        return None, error

    if node.ctype == "document":
        return schema.Document.model_validate(node), error

    return schema.Folder.model_validate(node), error


async def get_node_tags(
    db_session: AsyncSession, node_id: uuid.UUID, user_id: uuid.UUID
) -> Tuple[Iterable[schema.Tag] | None, schema.Error | None]:
    """Retrieves all node's tags"""

    subq = select(orm.NodeTagsAssociation.tag_id).where(
        orm.NodeTagsAssociation.node_id == node_id
    )

    stmt = select(orm.Tag).where(orm.Tag.id.in_(subq))

    try:
        tags = (await db_session.execute(stmt)).scalars()
    except Exception as e:
        error = schema.Error(messages=[str(e)])
        return None, error

    return [schema.Tag.model_validate(t) for t in tags], None


async def remove_node_tags(
    db_session: AsyncSession, node_id: uuid.UUID, tags: list[str], user_id: uuid.UUID
) -> Tuple[schema.Document | schema.Folder | None, schema.Error | None]:
    """Disassociates node tags"""
    error = None

    stmt = select(orm.Node).where(orm.Node.id == node_id, orm.Node.user_id == user_id)
    node = (await db_session.scalars(stmt)).one_or_none()

    if node is None:
        raise EntityNotFound(f"Node {node_id} not found")

    tag_ids = select(orm.Tag.id).where(orm.Tag.name.in_(tags))
    delete_stmt = delete(orm.NodeTagsAssociation).where(
        orm.NodeTagsAssociation.tag_id.in_(tag_ids),
        orm.NodeTagsAssociation.node_id == node_id,
    )

    try:
        await db_session.execute(delete_stmt)
        await db_session.commit()
    except Exception as e:
        error = schema.Error(messages=[str(e)])
        return None, error

    if node.ctype == "document":
        return schema.Document.model_validate(node), error

    return schema.Folder.model_validate(node), error


async def get_folder(
    db_session: AsyncSession, folder_id: UUID
) -> Tuple[orm.Folder | None, schema.Error | None]:
    breadcrumb = await get_ancestors(db_session, folder_id)
    stmt = select(orm.Folder).where(orm.Folder.id == folder_id)
    try:
        db_model = (await db_session.scalars(stmt)).one()
        db_model.breadcrumb = breadcrumb
    except Exception as e:
        error = schema.Error(messages=[str(e)])
        return None, error

    return db_model, None


async def delete_nodes(
    db_session: AsyncSession, node_ids: list[UUID], user_id: UUID
) -> schema.Error | None:
    all_ids_to_be_deleted = [
        item[0] for item in await get_descendants(db_session, node_ids=node_ids)
    ]

    now = datetime.utcnow()
    try:
        stmt = (
            update(orm.Node)
            .where(orm.Node.id.in_(all_ids_to_be_deleted))
            .values(deleted_at=now)
        )
        await db_session.execute(stmt)
        for nid in all_ids_to_be_deleted:
            await lib_ts_api.add_audit(
                db_session,
                user_id=user_id,
                action="node_soft_delete",
                resource_type="node",
                resource_id=nid,
            )
        await db_session.commit()
    except Exception as e:
        error = schema.Error(messages=[str(e)])
        return error
    return None


async def move_nodes(db_session: AsyncSession, source_ids: list[UUID], target_id: UUID) -> int:

    # Sqlite does not raise "Integrity Error" during update
    # when target does not exist. Thus, we issue here one more
    # extra sql statement just to check the existence of target_id
    stmt = select(orm.Node).where(
        orm.Node.id == target_id,
        orm.Node.deleted_at.is_(None),
    )
    target = (await db_session.execute(stmt)).scalar()
    descendants_ids = [
        item[0] for item in await get_descendants(db_session, node_ids=source_ids)
    ]
    if target is None:
        raise EntityNotFound("Node target not found")

    # Moving a node into itself would create a self-referencing parent and
    # can make the node effectively disappear from the tree. Reject it at
    # the database layer as a final safeguard even if a client bypasses the UI.
    if target_id in source_ids:
        raise ValueError("Cannot move a node into itself")

    stmt = (
        update(orm.Node).where(orm.Node.id.in_(source_ids)).values(parent_id=target_id)
    )
    # Moved nodes will be set to have same
    # parent as the target
    stmt_update_owner = (
        update(orm.Node)
        .where(orm.Node.id.in_(descendants_ids))
        .values(user_id=target.user_id, group_id=target.group_id)
    )

    result = await db_session.execute(stmt)
    await db_session.execute(stmt_update_owner)

    base_index = await next_sort_index(
        db_session, target_id, exclude_ids=source_ids
    )
    for offset, source_id in enumerate(source_ids):
        await db_session.execute(
            update(orm.Node)
            .where(orm.Node.id == source_id)
            .values(sort_index=base_index + offset)
        )

    await db_session.commit()

    return result.rowcount


async def reorder_nodes(
    db_session: AsyncSession,
    parent_id: UUID,
    node_ids: list[UUID],
    user_id: UUID | None,
) -> None:
    """Persist a custom child order for ``parent_id``.

    ``node_ids`` must be a permutation of children the user can view.
    Nodes the user cannot see stay in their current slots.
    """
    from papermerge.core.features.nodes.visibility import can_view_node

    requested = list(dict.fromkeys(node_ids))
    if len(requested) != len(node_ids):
        raise ValueError("node_ids must not contain duplicates")

    stmt = (
        select(orm.Node)
        .where(
            orm.Node.parent_id == parent_id,
            orm.Node.deleted_at.is_(None),
        )
        .order_by(orm.Node.sort_index.asc(), orm.Node.title.asc())
    )
    children = list((await db_session.scalars(stmt)).all())

    visible_ids: list[UUID] = []
    for child in children:
        if await can_view_node(db_session, node_id=child.id, user_id=user_id):
            visible_ids.append(child.id)

    if set(requested) != set(visible_ids):
        raise ValueError(
            "node_ids must list every visible child of the folder exactly once"
        )

    visible_set = set(visible_ids)
    queue = list(requested)
    merged: list[UUID] = []
    for child in children:
        if child.id in visible_set:
            merged.append(queue.pop(0))
        else:
            merged.append(child.id)

    for index, node_id in enumerate(merged):
        await db_session.execute(
            update(orm.Node).where(orm.Node.id == node_id).values(sort_index=index)
        )
    await db_session.commit()


async def prepare_documents_s3_data_deletion(
    db_session: AsyncSession, node_ids: list[UUID]
) -> DeleteDocumentsData:
    """Extract information from the list of `node_ids` about to be deleted

    Note: all nodes from `node_ids` are about to be deleted

    Extracts a list of document IDs which are about to be deleted.

    Extracts a list of document version IDs belonging to the document
    IDs which are about to be deleted.

    Extracts a list of page IDs belonging to the document versions
    which are about to be deleted
    """
    stmt = (
        select(orm.Document.id, orm.DocumentVersion.id, orm.Page.id)
        .select_from(orm.Document)
        .join(orm.DocumentVersion)
        .join(orm.Page)
        .where(orm.Document.id.in_(node_ids))
    )
    doc_ids = set()
    page_ids = set()
    doc_ver_ids = set()

    for row in await db_session.execute(stmt):
        doc_ids.add(row[0])
        doc_ver_ids.add(row[1])
        page_ids.add(row[2])

    return DeleteDocumentsData(
        document_ids=list(doc_ids),
        page_ids=list(page_ids),
        document_version_ids=list(doc_ver_ids),
    )


async def list_trash_nodes(
    db_session: AsyncSession,
    user_id: UUID,
    page_size: int,
    page_number: int,
) -> PaginatedResponse[Union[schema.DocumentNode, schema.Folder]]:
    """Nodes soft-deleted and owned by user."""
    loader_opt = selectin_polymorphic(orm.Node, [Folder, orm.Document])
    offset = (page_number - 1) * page_size
    visibility = await _trash_visibility_filter(db_session, user_id)
    count_stmt = (
        select(func.count())
        .select_from(orm.Node)
        .where(
            visibility,
            orm.Node.deleted_at.is_not(None),
        )
    )
    total = await db_session.scalar(count_stmt)
    base = select(orm.Node).where(
        visibility,
        orm.Node.deleted_at.is_not(None),
    )
    stmt = (
        base.options(selectinload(orm.Node.tags))
        .order_by(orm.Node.deleted_at.desc())
        .offset(offset)
        .limit(page_size)
        .options(loader_opt)
    )
    rows = (await db_session.scalars(stmt)).all()
    items = []
    for node in rows:
        if node.ctype == "folder":
            items.append(schema.Folder.model_validate(node))
        else:
            items.append(schema.DocumentNode.model_validate(node))
    num_pages = math.ceil((total or 0) / page_size) if page_size else 0
    return PaginatedResponse(
        page_size=page_size,
        page_number=page_number,
        num_pages=num_pages,
        items=items,
    )


async def restore_trash_nodes(
    db_session: AsyncSession, node_ids: list[UUID], user_id: UUID
) -> schema.Error | None:
    all_ids = [item[0] for item in await get_descendants(db_session, node_ids=node_ids)]
    stmt = select(orm.Node).where(
        orm.Node.id.in_(all_ids),
        orm.Node.deleted_at.is_not(None),
    )
    found = (await db_session.scalars(stmt)).all()
    if len(found) != len(all_ids):
        return schema.Error(messages=["Some nodes are not in trash or not owned"])
    for node in found:
        if not await _user_can_manage_trashed_node(db_session, node, user_id):
            return schema.Error(messages=["Some nodes are not in trash or not owned"])
    try:
        await db_session.execute(
            update(orm.Node)
            .where(orm.Node.id.in_(all_ids))
            .values(deleted_at=None)
        )
        for nid in all_ids:
            await lib_ts_api.add_audit(
                db_session,
                user_id=user_id,
                action="node_restore",
                resource_type="node",
                resource_id=nid,
            )
        await db_session.commit()
    except Exception as e:
        return schema.Error(messages=[str(e)])
    return None


async def permanent_delete_trashed_nodes(
    db_session: AsyncSession, node_ids: list[UUID], user_id: UUID
) -> schema.Error | None:
    """Hard-delete nodes that are currently soft-deleted (trash purge)."""
    all_ids = [item[0] for item in await get_descendants(db_session, node_ids=node_ids)]
    stmt = select(orm.Node).where(orm.Node.id.in_(all_ids))
    nodes = (await db_session.scalars(stmt)).all()
    for n in nodes:
        if n.deleted_at is None:
            return schema.Error(messages=["Only trashed nodes you own can be purged"])
        if not await _user_can_manage_trashed_node(db_session, n, user_id):
            return schema.Error(messages=["Only trashed nodes you own can be purged"])

    delete_details = await prepare_documents_s3_data_deletion(db_session, all_ids)
    stmt_del = delete(orm.Node).where(orm.Node.id.in_(all_ids))
    sqlite_hack_stmt = delete(orm.CustomFieldValue).where(
        orm.CustomFieldValue.document_id.in_(all_ids)
    )
    try:
        await db_session.execute(stmt_del)
        await db_session.execute(sqlite_hack_stmt)
        for nid in all_ids:
            await lib_ts_api.add_audit(
                db_session,
                user_id=user_id,
                action="node_purge",
                resource_type="node",
                resource_id=nid,
            )
        await db_session.commit()
    except Exception as e:
        return schema.Error(messages=[str(e)])
    events.delete_documents_s3_data(delete_details)
    return None


async def hard_delete_nodes_system(
    db_session: AsyncSession, node_ids: list[UUID]
) -> list[UUID]:
    """Permanently remove nodes (auto-purge); no per-user permission check."""
    if not node_ids:
        return []
    all_ids = list(
        {
            item[0]
            for item in await get_descendants(db_session, node_ids=node_ids)
        }
    )
    delete_details = await prepare_documents_s3_data_deletion(db_session, all_ids)
    stmt_del = delete(orm.Node).where(orm.Node.id.in_(all_ids))
    sqlite_hack_stmt = delete(orm.CustomFieldValue).where(
        orm.CustomFieldValue.document_id.in_(all_ids)
    )
    await db_session.execute(stmt_del)
    await db_session.execute(sqlite_hack_stmt)
    for nid in all_ids:
        await lib_ts_api.add_audit(
            db_session,
            user_id=None,
            action="node_purge",
            resource_type="node",
            resource_id=nid,
            detail="auto-purge",
        )
    await db_session.commit()
    events.delete_documents_s3_data(delete_details)
    return all_ids
