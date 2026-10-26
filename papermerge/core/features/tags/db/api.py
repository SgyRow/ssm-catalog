import uuid
import math
from typing import Tuple

from sqlalchemy import select, func, or_, delete
from sqlalchemy.exc import NoResultFound
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core.exceptions import EntityNotFound
from papermerge.core import schema
from papermerge.core import orm
from papermerge.core.features.tags import schema as tags_schema

ORDER_BY_MAP = {
    "name": orm.Tag.name.asc(),
    "-name": orm.Tag.name.desc(),
    "pinned": orm.Tag.pinned.asc(),
    "-pinned": orm.Tag.pinned.desc(),
    "description": orm.Tag.id.asc(),
    "-description": orm.Tag.id.desc(),
    "ID": orm.Tag.id.asc(),
    "-ID": orm.Tag.id.desc(),
    "group_name": orm.Group.name.asc(),
    "-group_name": orm.Group.name.desc(),
}


def _user_group_ids_subquery(user_id: uuid.UUID):
    UserGroupAlias = aliased(orm.user_groups_association)
    return select(UserGroupAlias.c.group_id).where(
        UserGroupAlias.c.user_id == user_id
    )


async def collect_visible_tag_ids(
    db_session: AsyncSession, user_id: uuid.UUID
) -> list[uuid.UUID]:
    """Tag IDs the user may list: owned, group, or used on a node they can view."""
    from papermerge.core.features.nodes.visibility import can_view_node, _is_superuser

    if await _is_superuser(db_session, user_id):
        rows = await db_session.scalars(select(orm.Tag.id))
        return list(rows.all())

    visible: set[uuid.UUID] = set()
    user_group_subq = _user_group_ids_subquery(user_id)

    owned_rows = await db_session.scalars(
        select(orm.Tag.id).where(
            or_(
                orm.Tag.user_id == user_id,
                orm.Tag.group_id.in_(user_group_subq),
            )
        )
    )
    visible.update(owned_rows.all())

    node_can_view: dict[uuid.UUID, bool] = {}
    pairs = (
        await db_session.execute(
            select(
                orm.NodeTagsAssociation.tag_id,
                orm.NodeTagsAssociation.node_id,
            )
            .join(
                orm.Node,
                orm.Node.id == orm.NodeTagsAssociation.node_id,
            )
            .where(orm.Node.deleted_at.is_(None))
        )
    ).all()

    for tag_id, node_id in pairs:
        if node_id not in node_can_view:
            node_can_view[node_id] = await can_view_node(
                db_session, node_id=node_id, user_id=user_id
            )
        if node_can_view[node_id]:
            visible.add(tag_id)

    return list(visible)


async def list_catalog_tags(
    db_session: AsyncSession, user_id: uuid.UUID
) -> list[orm.Tag]:
    """Organization-wide tag vocabulary (deduplicated by name)."""
    rows = await db_session.scalars(
        select(orm.Tag).order_by(orm.Tag.name.asc())
    )
    return dedupe_tag_orms_by_name(list(rows.all()), user_id)


async def find_catalog_tag_by_name(
    db_session: AsyncSession, user_id: uuid.UUID, name: str
) -> orm.Tag | None:
    key = name.casefold()
    for tag in await list_catalog_tags(db_session, user_id):
        if tag.name.casefold() == key:
            return tag
    return None


async def resolve_tag_by_name(
    db_session: AsyncSession, *, user_id: uuid.UUID, name: str
) -> orm.Tag:
    """Return the single canonical tag for `name` in the user's namespace."""
    user_group_subq = _user_group_ids_subquery(user_id)

    tag = (
        await db_session.scalars(
            select(orm.Tag).where(
                orm.Tag.name == name,
                orm.Tag.user_id == user_id,
            )
        )
    ).first()
    if tag is not None:
        return tag

    tag = (
        await db_session.scalars(
            select(orm.Tag).where(
                orm.Tag.name == name,
                orm.Tag.group_id.in_(user_group_subq),
            )
        )
    ).first()
    if tag is not None:
        return tag

    tag = (
        await db_session.scalars(
            select(orm.Tag)
            .join(
                orm.NodeTagsAssociation,
                orm.NodeTagsAssociation.tag_id == orm.Tag.id,
            )
            .join(orm.Node, orm.Node.id == orm.NodeTagsAssociation.node_id)
            .where(
                orm.Tag.name == name,
                orm.Node.user_id == user_id,
                orm.Node.deleted_at.is_(None),
            )
            .limit(1)
        )
    ).first()
    if tag is not None:
        return tag

    tag = orm.Tag(name=name, user_id=user_id, group_id=None)
    db_session.add(tag)
    await db_session.flush()
    return tag


def dedupe_tag_orms_by_name(
    tags: list[orm.Tag], user_id: uuid.UUID
) -> list[orm.Tag]:
    """One list entry per tag name; prefer the current user's tag record."""
    by_name: dict[str, orm.Tag] = {}
    for tag in tags:
        key = tag.name.casefold()
        existing = by_name.get(key)
        if existing is None:
            by_name[key] = tag
        elif tag.user_id == user_id and existing.user_id != user_id:
            by_name[key] = tag
    return sorted(by_name.values(), key=lambda t: t.name.casefold())


async def _visible_tag_orms_for_user(
    db_session: AsyncSession, user_id: uuid.UUID
) -> list[orm.Tag]:
    return await list_catalog_tags(db_session, user_id)


async def equivalent_tag_ids_for_name(
    db_session: AsyncSession, user_id: uuid.UUID, tag_name: str
) -> list[uuid.UUID]:
    rows = await db_session.scalars(
        select(orm.Tag.id).where(orm.Tag.name == tag_name)
    )
    return list(rows.all())


async def get_tags_without_pagination(
    db_session: AsyncSession,
    *,
    user_id: uuid.UUID | None = None,
    group_id: uuid.UUID | None = None,
) -> list[schema.Tag]:
    if group_id:
        db_items = (
            await db_session.scalars(
                select(orm.Tag).where(orm.Tag.group_id == group_id)
            )
        ).all()
    elif user_id:
        db_items = await _visible_tag_orms_for_user(db_session, user_id)
    else:
        raise ValueError("Both: group_id and user_id are missing")

    return [schema.Tag.model_validate(db_item) for db_item in db_items]


async def get_tags(
    db_session: AsyncSession,
    *,
    user_id: uuid.UUID,
    page_size: int,
    page_number: int,
    filter: str | None = None,
    order_by: str = "name",
) -> schema.PaginatedResponse[schema.Tag]:
    db_items = await _visible_tag_orms_for_user(db_session, user_id)

    if filter:
        needle = filter.strip().lower()
        db_items = [
            tag
            for tag in db_items
            if needle in tag.name.lower()
            or (tag.description and needle in tag.description.lower())
        ]

    reverse = order_by.startswith("-")
    col = order_by.lstrip("-")
    if col in ("name", "ID"):
        key = (lambda t: t.name.casefold()) if col == "name" else (lambda t: str(t.id))
        db_items.sort(key=key, reverse=reverse)
    elif col == "pinned":
        db_items.sort(key=lambda t: t.pinned, reverse=reverse)
    else:
        db_items.sort(key=lambda t: t.name.casefold())

    total_tags = len(db_items)
    num_pages = math.ceil(total_tags / page_size) if total_tags else 0
    start = (page_number - 1) * page_size
    page_items = db_items[start : start + page_size]

    items = [schema.Tag.model_validate(tag) for tag in page_items]

    return schema.PaginatedResponse[schema.Tag](
        items=items, page_size=page_size, page_number=page_number, num_pages=num_pages
    )


async def get_tag(
    db_session: AsyncSession, tag_id: uuid.UUID
) -> Tuple[schema.Tag | None, schema.Error | None]:

    stmt = (
        select(orm.Tag, orm.Group)
        .join(orm.Group, orm.Group.id == orm.Tag.group_id, isouter=True)
        .where(orm.Tag.id == tag_id)
    )
    try:
        row = (await db_session.execute(stmt)).unique().one()
        kwargs = {
            "id": row.Tag.id,
            "name": row.Tag.name,
            "bg_color": row.Tag.bg_color,
            "fg_color": row.Tag.fg_color,
            "description": row.Tag.description,
            "pinned": row.Tag.pinned,
        }

        if row.Group and row.Group.id:
            kwargs["group_id"] = row.Group.id
            kwargs["group_name"] = row.Group.name
    except NoResultFound:
        raise EntityNotFound
    except Exception as e:
        error = schema.Error(messages=[str(e)])
        return None, error

    if row is None:
        raise EntityNotFound

    return schema.Tag.model_validate(kwargs), None


async def create_tag(
    db_session: AsyncSession, attrs: schema.CreateTag
) -> Tuple[schema.Tag | None, schema.Error | None]:

    if attrs.user_id and not attrs.group_id:
        if await find_catalog_tag_by_name(
            db_session, user_id=attrs.user_id, name=attrs.name
        ):
            return None, schema.Error(
                messages=[f"Tag '{attrs.name}' already exists"]
            )

    db_tag = orm.Tag(**attrs.model_dump())
    db_session.add(db_tag)

    try:
        await db_session.commit()
    except Exception as e:
        error = schema.Error(messages=[str(e)])
        return None, error

    return schema.Tag.model_validate(db_tag), None


async def update_tag(
    db_session: AsyncSession, tag_id: uuid.UUID, attrs: schema.UpdateTag
) -> Tuple[schema.Tag | None, schema.Error | None]:

    stmt = select(orm.Tag).where(orm.Tag.id == tag_id)
    tag = (await db_session.execute(stmt)).scalars().one()
    db_session.add(tag)

    if attrs.name:
        tag.name = attrs.name

    if attrs.fg_color:
        tag.fg_color = attrs.fg_color

    if attrs.bg_color:
        tag.bg_color = attrs.bg_color

    if attrs.description:
        tag.description = attrs.description

    if attrs.group_id:
        tag.user_id = None
        tag.group_id = attrs.group_id
    elif attrs.user_id:
        tag.user_id = attrs.user_id
        tag.group_id = None
    else:
        raise ValueError(
            "Either attrs.user_id or attrs.group_id should be non-empty value"
        )

    try:
        await db_session.commit()
        db_tag = await db_session.get(orm.Tag, tag_id)
    except Exception as e:
        error = schema.Error(messages=[str(e)])
        return None, error

    return schema.Tag.model_validate(db_tag), None


async def delete_tag(
    db_session: AsyncSession,
    tag_id: uuid.UUID,
):
    tag = (
        await db_session.scalars(select(orm.Tag).where(orm.Tag.id == tag_id))
    ).one_or_none()
    if tag is None:
        raise EntityNotFound()

    tag_ids = list(
        await db_session.scalars(
            select(orm.Tag.id).where(orm.Tag.name == tag.name)
        )
    )

    await db_session.execute(
        delete(orm.NodeTagsAssociation).where(
            orm.NodeTagsAssociation.tag_id.in_(tag_ids)
        )
    )
    await db_session.execute(delete(orm.Tag).where(orm.Tag.id.in_(tag_ids)))
    await db_session.commit()


async def user_can_access_tag(
    db_session: AsyncSession,
    tag_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    catalog_ids = {tag.id for tag in await list_catalog_tags(db_session, user_id)}
    return tag_id in catalog_ids


async def get_tag_nodes(
    db_session: AsyncSession,
    *,
    tag_id: uuid.UUID,
    user_id: uuid.UUID,
    page_size: int,
    page_number: int,
    filter: str | None = None,
) -> schema.PaginatedResponse[tags_schema.TaggedNodeOut]:
    from papermerge.core.features.nodes.visibility import can_view_node

    tag = await db_session.get(orm.Tag, tag_id)
    if tag is None:
        raise EntityNotFound()

    tag_ids = await equivalent_tag_ids_for_name(
        db_session, user_id=user_id, tag_name=tag.name
    )
    if not tag_ids:
        tag_ids = [tag_id]

    query = (
        select(orm.Node)
        .join(orm.NodeTagsAssociation, orm.NodeTagsAssociation.node_id == orm.Node.id)
        .where(orm.NodeTagsAssociation.tag_id.in_(tag_ids))
        .where(orm.Node.deleted_at.is_(None))
        .order_by(orm.Node.title.asc())
    )
    if filter:
        query = query.where(
            func.lower(orm.Node.title).contains(filter.strip().lower(), autoescape=True)
        )

    nodes = (await db_session.scalars(query)).all()

    visible_nodes = []
    for node in nodes:
        if await can_view_node(db_session, node_id=node.id, user_id=user_id):
            visible_nodes.append(node)

    total_nodes = len(visible_nodes)
    num_pages = max(1, math.ceil(total_nodes / page_size)) if total_nodes else 0
    start = (page_number - 1) * page_size
    page_nodes = visible_nodes[start : start + page_size]

    items = [
        tags_schema.TaggedNodeOut(
            node_id=node.id,
            title=node.title,
            ctype=node.ctype,
            updated_at=node.updated_at,
        )
        for node in page_nodes
    ]

    return schema.PaginatedResponse[tags_schema.TaggedNodeOut](
        items=items,
        page_size=page_size,
        page_number=page_number,
        num_pages=num_pages,
    )
