from typing import List, Tuple
from uuid import UUID

from sqlalchemy import select, exists, literal
from sqlalchemy.orm import aliased, selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core.features.nodes.db import orm
from papermerge.core.features.shared_nodes.db import orm as sn_orm
from papermerge.core.features.groups.db import orm as groups_orm
from papermerge.core.features.roles.db import orm as roles_orm
from papermerge.core.features.roles.db.orm import users_roles_association
from papermerge.core.features.nodes import schema as nodes_schema
from papermerge.core.features.users.schema import user_display_name


async def get_ancestors(
    db_session: AsyncSession, node_id: UUID, include_self=True
) -> List[Tuple[UUID, str]]:
    """Returns all ancestors of the node

    The most distant ancestor will be the first element in returned list.
    The most recent ancestor will be the last element in returned list.
    In other words, "home" or "inbox" folders will be first in returned list
    """
    nodes_anchor = (
        select(
            orm.Node.id, orm.Node.title, orm.Node.parent_id, literal(0).label("level")
        )
        .where(orm.Node.id == node_id)
        .cte(recursive=True, name="tree")
    )
    tree = nodes_anchor.union_all(
        select(
            orm.Node.id,
            orm.Node.title,
            orm.Node.parent_id,
            (nodes_anchor.c.level + 1).label("level"),
        ).where(nodes_anchor.c.parent_id == orm.Node.id)
    )

    stmt = (
        select(tree.c.id, tree.c.title).select_from(tree).order_by(tree.c.level.desc())
    )

    if not include_self:
        stmt = stmt.where(tree.c.id != node_id)

    result = await db_session.execute(stmt)

    return [(row.id, row.title) for row in result]


async def get_descendants(
    db_session: AsyncSession, node_ids: list[UUID], include_selfs=True
) -> list[Tuple[UUID, str]]:
    """Returns descendants of all `node_ids` nodes

    When user selects documents and folders in UI he/she wants actually
    to delete selected nodes (documents and folders) we well as their
    descendants. `node_ids` will be documents and folders' IDs users
    selected in UI.
    """

    if not isinstance(node_ids, list):
        raise ValueError("node_ids argument must be a list")

    if len(node_ids) < 1:
        raise ValueError("len(node_ids) must be >= 1 ")

    nodes_anchor = (
        select(orm.Node.id, orm.Node.title)
        .where(orm.Node.id.in_(node_ids))
        .cte(recursive=True, name="tree")
    )
    tree = nodes_anchor.union_all(
        select(orm.Node.id, orm.Node.title).where(
            nodes_anchor.c.id == orm.Node.parent_id
        )
    )

    stmt = select(tree.c.id, tree.c.title).select_from(tree)

    if not include_selfs:
        stmt = stmt.where(tree.c.id.not_in(node_ids))

    result = await db_session.execute(stmt)

    return [(row.id, row.title) for row in result]


async def require_node_perm(
    db_session: AsyncSession,
    node_id: UUID,
    codename: str,
    user_id: UUID,
) -> None:
    """Raise HTTP 403 if `user_id` lacks `codename` permission on `node_id`.

    Thin wrapper over `has_node_perm` used by routers to keep the per-endpoint
    permission guard a single line instead of a repetitive 6-line if-block.
    """
    # Imported here to avoid a circular import at module load time
    # (core.exceptions pulls in features, features pull in db.common).
    from papermerge.core import exceptions as exc

    if not await has_node_perm(
        db_session, node_id=node_id, codename=codename, user_id=user_id
    ):
        raise exc.HTTP403Forbidden()


async def require_node_perm_any(
    db_session: AsyncSession,
    node_id: UUID,
    user_id: UUID,
    *codenames: str,
) -> None:
    """Raise HTTP 403 unless `user_id` has any of `codenames` on `node_id`."""
    from papermerge.core import exceptions as exc

    for codename in codenames:
        if await has_node_perm(
            db_session, node_id=node_id, codename=codename, user_id=user_id
        ):
            return
    raise exc.HTTP403Forbidden()


async def _user_has_any_portal_perm_via_account_roles(
    db_session: AsyncSession, user_id: UUID, *portal_codenames: str
) -> bool:
    """True if the user has any of the given ``portal.*`` perms on account roles.

    Portal nodes are owned by the ``legal_portal`` group; matching ``portal.*``
    permissions on the user's roles (``users_roles``) must grant access without
    group membership, consistent with :func:`has_node_perm` handling of
    ``node.view`` under the portal root.
    """
    from papermerge.core.features.roles.db.orm import Role
    from papermerge.core.features.users.db.orm import User

    if not portal_codenames:
        return False

    wanted = frozenset(portal_codenames)

    u = await db_session.scalar(
        select(User)
        .options(selectinload(User.roles).selectinload(Role.permissions))
        .where(User.id == user_id)
    )
    if u is None:
        return False
    if u.is_superuser:
        return True
    for role in u.roles:
        for perm in role.permissions:
            if perm.codename in wanted:
                return True
    return False


async def has_node_perm(
    db_session: AsyncSession,
    node_id: UUID,
    codename: str,
    user_id: UUID,
) -> bool:
    """
    Has user `codename` permission for `node_id`?

    SELECT EXISTS(
        SELECT nodes.id
        FROM nodes
        WHERE id = <node_id> AND
        (
            user_id = <user_id>
            OR
            group_id IN (
                SELECT ug.group_id
                FROM users_groups ug
                WHERE ug.user_id =  <user_id>
            )
        )
        UNION ALL
        SELECT sn.id
        FROM shared_nodes sn
        JOIN nodes n ON n.id = sn.node_id
        JOIN roles r ON r.id = sn.role_id
        JOIN roles_permissions rp ON rp.role_id = r.id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE (
            sn.user_id = <user_id>
            OR
            sn.group_id IN (
                SELECT ug.group_id
                FROM users_groups ug
                WHERE ug.user_id =  <user_id>
            )
        )
        AND p.codename = <perm>
        AND sn.node_id IN (<node_id> ancestors)
    )
    """
    ug = aliased(groups_orm.user_groups_association)
    # groups user belongs to
    user_group_ids = select(ug.c.group_id).where(ug.c.user_id == user_id)

    from papermerge.core.features.auth import scopes as auth_scopes
    from papermerge.core.features.portal.db import api as portal_dbapi

    # Fast path: direct ownership/group access (except node.view — visibility applies).
    if codename != auth_scopes.NODE_VIEW:
        node_access_stmt = exists(
            select(orm.Node.id).where(
                (orm.Node.id == node_id)
                & ((orm.Node.user_id == user_id) | (orm.Node.group_id.in_(user_group_ids)))
                & (orm.Node.deleted_at.is_(None))
            )
        ).select()
        has_direct_access = (await db_session.execute(node_access_stmt)).scalar_one()
        if has_direct_access:
            return True
    else:
        personal_access_stmt = exists(
            select(orm.Node.id).where(
                (orm.Node.id == node_id)
                & (orm.Node.user_id == user_id)
                & (orm.Node.deleted_at.is_(None))
            )
        ).select()
        if (await db_session.execute(personal_access_stmt)).scalar_one():
            return True

    root_id = await portal_dbapi.get_portal_root_id(db_session)
    if root_id is not None and await portal_dbapi.is_node_under_portal_root(
        db_session, node_id, root_id
    ):
        # Group-owned portal tree: infer library access from portal.* on account roles.
        if codename == auth_scopes.NODE_CREATE:
            if await _user_has_any_portal_perm_via_account_roles(
                db_session,
                user_id,
                auth_scopes.PORTAL_SECTION_CREATE,
                auth_scopes.PORTAL_DOCUMENT_UPLOAD,
            ):
                return True
        elif codename == auth_scopes.DOCUMENT_UPLOAD:
            if await _user_has_any_portal_perm_via_account_roles(
                db_session,
                user_id,
                auth_scopes.PORTAL_DOCUMENT_UPLOAD,
                auth_scopes.PORTAL_DOCUMENT_UPDATE,
            ):
                return True
        elif codename == auth_scopes.NODE_DELETE:
            ctype = await db_session.scalar(
                select(orm.Node.ctype).where(orm.Node.id == node_id)
            )
            if ctype == "folder":
                if await _user_has_any_portal_perm_via_account_roles(
                    db_session, user_id, auth_scopes.PORTAL_SECTION_DELETE
                ):
                    return True
            elif ctype == "document":
                if await _user_has_any_portal_perm_via_account_roles(
                    db_session, user_id, auth_scopes.PORTAL_DOCUMENT_DELETE
                ):
                    return True
        elif codename in (
            auth_scopes.NODE_UPDATE,
            auth_scopes.NODE_MOVE,
            auth_scopes.DOCUMENT_UPDATE_TAGS,
        ):
            ctype = await db_session.scalar(
                select(orm.Node.ctype).where(orm.Node.id == node_id)
            )
            if ctype == "folder":
                if codename == auth_scopes.DOCUMENT_UPDATE_TAGS:
                    return False
                if await _user_has_any_portal_perm_via_account_roles(
                    db_session, user_id, auth_scopes.PORTAL_SECTION_UPDATE
                ):
                    return True
            elif ctype == "document":
                if await _user_has_any_portal_perm_via_account_roles(
                    db_session, user_id, auth_scopes.PORTAL_DOCUMENT_UPDATE
                ):
                    return True

    ancestor_ids = [item[0] for item in await get_ancestors(db_session, node_id)]
    # account roles assigned to the user (users_roles)
    user_account_role_ids = select(users_roles_association.c.role_id).where(
        users_roles_association.c.user_id == user_id
    )

    node_shared_access = (
        select(sn_orm.SharedNode.id)
        .select_from(sn_orm.SharedNode)
        .join(orm.Node, orm.Node.id == sn_orm.SharedNode.node_id)
        .join(roles_orm.Role, roles_orm.Role.id == sn_orm.SharedNode.role_id)
        .join(
            roles_orm.roles_permissions_association,
            roles_orm.roles_permissions_association.c.role_id == roles_orm.Role.id,
        )
        .join(
            roles_orm.Permission,
            roles_orm.Permission.id
            == roles_orm.roles_permissions_association.c.permission_id,
        )
        .where(
            (roles_orm.Permission.codename == codename)
            & (sn_orm.SharedNode.node_id.in_(ancestor_ids))
            & (
                (sn_orm.SharedNode.user_id == user_id)
                | (sn_orm.SharedNode.group_id.in_(user_group_ids))
                | (sn_orm.SharedNode.recipient_role_id.in_(user_account_role_ids))
            )
            & (orm.Node.deleted_at.is_(None))
        )
    )
    stmt = exists(node_shared_access).select()

    has_access = (await db_session.execute(stmt)).scalar_one()

    if has_access:
        return True

    from papermerge.core.features.auth import scopes as auth_scopes
    from papermerge.core.features.nodes.visibility import can_view_node

    if codename == auth_scopes.NODE_VIEW:
        return await can_view_node(db_session, node_id=node_id, user_id=user_id)

    if codename == auth_scopes.TAG_SELECT:
        return await can_view_node(db_session, node_id=node_id, user_id=user_id)

    return False


async def get_node_owner(db_session: AsyncSession, node_id: UUID) -> nodes_schema.Owner:
    stmt = (
        select(
            orm.Node.group_id,
            groups_orm.Group.name.label("group_name"),
            orm.Node.user_id,
            orm.User.username,
            orm.User.first_name,
            orm.User.last_name,
        )
        .select_from(orm.Node)
        .join(orm.User, orm.User.id == orm.Node.user_id, isouter=True)
        .join(groups_orm.Group, groups_orm.Group.id == orm.Node.group_id, isouter=True)
    ).where(orm.Node.id == node_id)

    row = (await db_session.execute(stmt)).one()

    if row.user_id is None:
        owner_name = row.group_name
    else:
        owner_name = user_display_name(row.first_name, row.last_name, row.username)

    return nodes_schema.Owner(
        name=owner_name, user_id=row.user_id, group_id=row.group_id
    )


async def get_directly_accessible_node_ids(
    db_session: AsyncSession,
    node_ids: list[UUID],
    user_id: UUID,
) -> set[UUID]:
    """
    Returns node IDs directly accessible by ownership/group membership.
    Does not include inherited/shared access via ancestors.
    """
    if not node_ids:
        return set()
    ug = aliased(groups_orm.user_groups_association)
    user_group_ids = select(ug.c.group_id).where(ug.c.user_id == user_id)
    stmt = select(orm.Node.id).where(
        orm.Node.id.in_(node_ids),
        orm.Node.deleted_at.is_(None),
        (orm.Node.user_id == user_id) | (orm.Node.group_id.in_(user_group_ids)),
    )
    rows = (await db_session.execute(stmt)).all()
    return {row.id for row in rows}
