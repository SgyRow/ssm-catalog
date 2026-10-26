"""Tests for node visibility and public library API."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core.features.library_ts.db.settings_orm import LibrarySettings
from papermerge.core.features.library_ts.constants import LIBRARY_SETTINGS_ROW_ID
from papermerge.core.features.nodes.db.visibility_orm import NodeAccessLevel
from papermerge.core.features.nodes.db import visibility_api as vis_dbapi
from papermerge.core.features.nodes import schema as nodes_schema
from papermerge.core.features.nodes.visibility import (
    can_view_node,
    resolve_effective_visibility,
)


@pytest.mark.asyncio
async def test_visibility_inheritance_public_child(
    db_session: AsyncSession, make_user, make_folder
):
    user = await make_user("owner")
    parent = await make_folder("Public Section", user=user, parent=user.home_folder)
    child = await make_folder("Child", user=user, parent=parent)

    await vis_dbapi.set_node_visibility_settings(
        db_session,
        parent.id,
        nodes_schema.UpdateNodeVisibility(inherit=False, access_level="public"),
    )

    effective = await resolve_effective_visibility(db_session, child.id)
    assert effective.access_level == NodeAccessLevel.public
    assert effective.is_inherited is True

    assert await can_view_node(db_session, child.id, user_id=None) is True


@pytest.mark.asyncio
async def test_private_node_not_visible_to_guest(
    db_session: AsyncSession, make_user, make_folder
):
    user = await make_user("owner")
    folder = await make_folder("Secret", user=user, parent=user.home_folder)

    assert await can_view_node(db_session, folder.id, user_id=None) is False


@pytest.mark.asyncio
async def test_role_based_visible_to_matching_role(
    db_session: AsyncSession, make_user, make_folder, make_role
):
    from papermerge.core.features.roles.db.orm import users_roles_association

    owner = await make_user("owner")
    viewer = await make_user("viewer", is_superuser=False)
    role = await make_role(name="library_reader", scopes=["node.view"])
    await db_session.execute(
        users_roles_association.insert().values(
            user_id=viewer.id, role_id=role.id
        )
    )
    await db_session.commit()

    folder = await make_folder("Staff Only", user=owner, parent=owner.home_folder)
    await vis_dbapi.set_node_visibility_settings(
        db_session,
        owner.home_folder_id,
        nodes_schema.UpdateNodeVisibility(
            inherit=False,
            access_level="role_based",
            role_ids=[role.id],
        ),
    )
    await vis_dbapi.set_node_visibility_settings(
        db_session,
        folder.id,
        nodes_schema.UpdateNodeVisibility(
            inherit=False,
            access_level="role_based",
            role_ids=[role.id],
        ),
    )

    assert await can_view_node(db_session, folder.id, user_id=viewer.id) is True
    assert await can_view_node(db_session, folder.id, user_id=None) is False


@pytest.mark.asyncio
async def test_public_child_visible_without_public_ancestor(
    db_session: AsyncSession, make_user, make_folder
):
    """Explicit public on a folder is enough; private ancestors must not block guests."""
    user = await make_user("owner")
    parent = await make_folder("Private Section", user=user, parent=user.home_folder)
    child = await make_folder("Open", user=user, parent=parent)

    await vis_dbapi.set_node_visibility_settings(
        db_session,
        child.id,
        nodes_schema.UpdateNodeVisibility(inherit=False, access_level="public"),
    )

    assert await can_view_node(db_session, child.id, user_id=None) is True


@pytest.mark.asyncio
async def test_group_member_respects_visibility(
    db_session: AsyncSession,
    make_user,
    make_folder,
    make_group,
):
    from papermerge.core.features.groups.db.orm import user_groups_association

    owner = await make_user("owner")
    member = await make_user("member", is_superuser=False)
    group = await make_group(name="legal_portal")
    await db_session.execute(
        user_groups_association.insert().values(
            user_id=member.id, group_id=group.id
        )
    )
    await db_session.commit()

    folder = await make_folder(
        "Restricted",
        parent=owner.home_folder,
        group=group,
    )
    await vis_dbapi.set_node_visibility_settings(
        db_session,
        folder.id,
        nodes_schema.UpdateNodeVisibility(inherit=False, access_level="private"),
    )

    assert await can_view_node(db_session, folder.id, user_id=member.id) is False


@pytest.mark.asyncio
async def test_public_api_lists_only_public_children(
    db_session: AsyncSession,
    make_user,
    make_folder,
    api_client,
):
    user = await make_user("admin")
    public_folder = await make_folder("Open", user=user, parent=user.home_folder)
    await make_folder("Closed", user=user, parent=user.home_folder)

    await vis_dbapi.set_node_visibility_settings(
        db_session,
        public_folder.id,
        nodes_schema.UpdateNodeVisibility(inherit=False, access_level="public"),
    )

    db_session.add(
        LibrarySettings(
            id=LIBRARY_SETTINGS_ROW_ID,
            catalog_root_node_id=user.home_folder_id,
        )
    )
    await db_session.commit()

    response = await api_client.get(f"/public/nodes/{user.home_folder_id}")
    assert response.status_code == 200
    titles = {item["title"] for item in response.json()["items"]}
    assert "Open" in titles
    assert "Closed" not in titles


@pytest.mark.asyncio
async def test_put_visibility_requires_update_perm(
    db_session: AsyncSession,
    user,
    make_folder,
    auth_api_client,
):
    folder = await make_folder("Docs", user=user, parent=user.home_folder)

    response = await auth_api_client.put(
        f"/nodes/{folder.id}/visibility",
        json={"inherit": False, "access_level": "public"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["access_level"] == "public"
    assert data["inherit"] is False
