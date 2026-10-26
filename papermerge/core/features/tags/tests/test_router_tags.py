import uuid

from sqlalchemy import func, select, exists
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import orm, schema
from papermerge.core.tests.types import AuthTestClient
from papermerge.core.features.nodes.db import api as nodes_dbapi
from papermerge.core.features.tags import schema as tags_schema


async def test_create_tag_route(auth_api_client: AuthTestClient, db_session: AsyncSession):
    count_before_result = await db_session.execute(select(func.count(orm.Tag.id)))
    count_before = count_before_result.scalar()
    assert count_before == 0

    response = await auth_api_client.post(
        "/tags/",
        json={"name": "important"},
    )

    assert response.status_code == 201, response.json()
    count_after_result = await db_session.execute(select(func.count(orm.Tag.id)))
    count_after = count_after_result.scalar()
    assert count_after == 1


async def test_update_tag_route(auth_api_client: AuthTestClient, make_tag, user, db_session):
    tag: schema.Tag = await make_tag(name="draft", bg_color="red", user=user)

    response = await auth_api_client.patch(
        f"/tags/{tag.id}",
        # only `name` attr is being updated
        json={"name": "draft-updated"},
    )

    assert response.status_code == 200, response.json()
    updated_tag = await db_session.get(orm.Tag, tag.id)

    # `name` attribute was updated
    assert updated_tag.name == "draft-updated"
    # other attributes did not change
    assert updated_tag.bg_color == tag.bg_color
    assert updated_tag.fg_color == tag.fg_color


async def test_get_tag_route(auth_api_client: AuthTestClient, make_tag, user):
    tag: schema.Tag = await make_tag(name="draft", bg_color="red", user=user)

    response = await auth_api_client.get(
        f"/tags/{tag.id}",
    )

    assert response.status_code == 200, response.json()


async def test_get_non_existing_tag(auth_api_client: AuthTestClient, make_tag, user):
    """
    In this use case valid UUID is passed - however there is no tag
    with such UUID
    """

    response = await auth_api_client.get(
        f"/tags/{uuid.uuid4()}",
    )

    assert response.status_code == 404, response.json()


async def test_delete_tag_route(auth_api_client: AuthTestClient, db_session: AsyncSession, make_tag, user):
    tag: schema.Tag = await make_tag(name="draft", bg_color="red", user=user)

    response = await auth_api_client.delete(
        f"/tags/{tag.id}",
    )

    assert response.status_code == 204
    tags_count = (await db_session.execute(select(func.count(orm.Tag.id)))).scalar()
    assert tags_count == 0


async def test_tags_paginated_result__8_items_first_page(
    make_tag, auth_api_client: AuthTestClient, user
):
    total_tags = 8
    for i in range(total_tags):
        await make_tag(name=f"Tag {i}", user=user)

    params = {"page_size": 5, "page_number": 1}
    response = await auth_api_client.get("/tags/", params=params)

    assert response.status_code == 200, response.json()

    paginated_items = schema.PaginatedResponse[schema.Tag](**response.json())

    assert paginated_items.page_size == 5
    assert paginated_items.page_number == 1
    assert paginated_items.num_pages == 2
    assert len(paginated_items.items) == 5


async def test_get_all_tags_no_pagination(make_tag, auth_api_client: AuthTestClient, user):
    total_tags = 8
    for i in range(total_tags):
        await make_tag(name=f"Tag {i}", user=user)

    response = await auth_api_client.get("/tags/all")

    assert response.status_code == 200, response.json()

    items = [schema.Tag(**item) for item in response.json()]

    assert len(items) == 8


async def test_get_all_tags_no_pagination_per_user(make_tag, make_api_client):
    """
    Tags are per user. In other words, each user can create and thus
    own his/her tags. By default, i.e. without explicit sharing,
    each user will be able to list/view only his/her tags.

    In this scenario:

        * User A has 5 tags
        * User B has 8 tags

    Then, by default, user A will get only his/her tags (and user B, his/her)
    """
    client_a: AuthTestClient = await make_api_client(username="user A")
    client_b: AuthTestClient = await make_api_client(username="user B")

    user_a_tags_count = 5
    for i in range(user_a_tags_count):
        await make_tag(name=f"Tag {i}", user=client_a.user)

    user_b_tags_count = 8
    for i in range(user_b_tags_count):
        await make_tag(name=f"Tag {i}", user=client_b.user)

    # Client B / User B
    response = await client_a.get("/tags/all")

    assert response.status_code == 200, response.json()
    items_user_a = [schema.Tag(**item) for item in response.json()]

    assert len(items_user_a) == user_a_tags_count

    # Client B / User B
    response = await client_b.get("/tags/all")
    assert response.status_code == 200, response.json()
    items_user_b = [schema.Tag(**item) for item in response.json()]

    assert len(items_user_b) == user_b_tags_count

async def test_delete_tag_which_has_associated_folder(
    make_folder, make_tag, db_session: AsyncSession, user, auth_api_client
):
    folder = await make_folder(title="My Documents", user=user, parent=user.home_folder)
    tag = await make_tag(name="important", user=user)

    await nodes_dbapi.assign_node_tags(
        db_session,
        node_id=folder.id,
        tags=["important"],
        user_id=user.id,
    )

    # delete tagged folder
    response = await auth_api_client.delete(f"/tags/{tag.id}")

    assert response.status_code == 204

    # folder still exists
    q = select(orm.Folder).filter(orm.Folder.id == folder.id)
    result = await db_session.execute(select(exists(q)))
    assert result.scalar() is True

    # but tag was deleted
    q_tag = select(orm.Tag).filter(orm.Tag.name == "important")
    result_tag = await db_session.execute(select(exists(q_tag)))
    assert result_tag.scalar() is False

    assoc = select(orm.NodeTagsAssociation).where(
        orm.NodeTagsAssociation.node_id == folder.id
    )
    result_assoc = await db_session.execute(select(exists(assoc)))
    assert result_assoc.scalar() is False

async def test_delete_tag_which_has_associated_document(
    make_document, make_tag, db_session: AsyncSession, user, auth_api_client
):
    doc = await make_document(title="My Contract", user=user, parent=user.home_folder)
    tag = await make_tag(name="important", user=user)

    await nodes_dbapi.assign_node_tags(
        db_session,
        node_id=doc.id,
        tags=["important"],
        user_id=user.id,
    )

    # delete tagged folder
    response = await auth_api_client.delete(f"/tags/{tag.id}")

    assert response.status_code == 204

    # document still exists
    q = select(orm.Document).filter(orm.Document.id == doc.id)
    result = await db_session.execute(select(exists(q)))
    assert result.scalar() is True

    # but tag was deleted
    q_tag = select(orm.Tag).filter(orm.Tag.name == "important")
    result = await db_session.execute(select(exists(q_tag)))
    assert result.scalar() is False


async def test__positive__tags_all_route_with_group_id_param(
    db_session: AsyncSession, make_tag, auth_api_client: AuthTestClient, user, make_group
):
    """In this scenario current user belongs to the
    group provided as parameter and there are two tags
    belonging to that group. In such case endpoint should
    return only two tags: the both belonging to the group
    """
    group: orm.Group = await make_group("research")

    user_a_tags_count = 5
    for i in range(user_a_tags_count):
        await make_tag(name=f"Tag {i}", user=user)

    await make_tag(name="tag research 1", group_id=group.id)
    await make_tag(name="tag research 2", group_id=group.id)

    # user belongs to 'research' group
    user.groups.append(group)
    db_session.add(user)
    await db_session.commit()

    response = await auth_api_client.get("/tags/all", params={"group_id": str(group.id)})

    assert response.status_code == 200, response.json()
    dtype_names = {schema.Tag(**kw).name for kw in response.json()}
    assert dtype_names == {"tag research 1", "tag research 2"}


async def test_get_tag_nodes_route(
    make_document, make_tag, auth_api_client: AuthTestClient, user, db_session
):
    doc_a = await make_document(title="Contract A", user=user, parent=user.home_folder)
    doc_b = await make_document(title="Contract B", user=user, parent=user.home_folder)
    tag = await make_tag(name="important", user=user)

    await nodes_dbapi.assign_node_tags(
        db_session,
        node_id=doc_a.id,
        tags=["important"],
        user_id=user.id,
    )
    await nodes_dbapi.assign_node_tags(
        db_session,
        node_id=doc_b.id,
        tags=["important"],
        user_id=user.id,
    )

    response = await auth_api_client.get(f"/tags/{tag.id}/nodes")

    assert response.status_code == 200, response.json()
    paginated = schema.PaginatedResponse[tags_schema.TaggedNodeOut](**response.json())
    assert len(paginated.items) == 2
    titles = {item.title for item in paginated.items}
    assert titles == {"Contract A", "Contract B"}


async def test_get_tag_nodes_route__other_user_tag_not_visible(
    make_document, make_tag, make_api_client, db_session
):
    owner = await make_api_client(username="owner")
    other = await make_api_client(username="other")
    doc = await make_document(title="Secret", user=owner.user, parent=owner.user.home_folder)
    tag = await make_tag(name="private", user=owner.user)

    await nodes_dbapi.assign_node_tags(
        db_session,
        node_id=doc.id,
        tags=["private"],
        user_id=owner.user.id,
    )

    response = await other.get(f"/tags/{tag.id}/nodes")
    assert response.status_code == 404, response.json()


async def test_get_all_tags_lists_catalog_after_admin_create(
    make_tag, auth_api_client: AuthTestClient, user
):
    await make_tag(name="тег", user=user)

    response = await auth_api_client.get("/tags/all")

    assert response.status_code == 200, response.json()
    names = {schema.Tag(**kw).name for kw in response.json()}
    assert "тег" in names


async def test_assign_unknown_tag_fails(
    make_document, auth_api_client: AuthTestClient, user, db_session
):
    doc = await make_document(title="Invoice", user=user, parent=user.home_folder)

    response = await auth_api_client.post(
        f"/nodes/{doc.id}/tags",
        json=["nonexistent-tag"],
    )

    assert response.status_code == 400, response.json()


async def test_assign_same_tag_name_reuses_single_tag_record(
    make_document, make_tag, auth_api_client: AuthTestClient, user, db_session
):
    await make_tag(name="shared", user=user)
    doc_a = await make_document(title="A", user=user, parent=user.home_folder)
    doc_b = await make_document(title="B", user=user, parent=user.home_folder)

    await nodes_dbapi.assign_node_tags(
        db_session, node_id=doc_a.id, tags=["shared"], user_id=user.id
    )
    await nodes_dbapi.assign_node_tags(
        db_session, node_id=doc_b.id, tags=["shared"], user_id=user.id
    )

    response = await auth_api_client.get("/tags/all")
    assert response.status_code == 200, response.json()
    items = [schema.Tag(**kw) for kw in response.json()]
    shared = [t for t in items if t.name == "shared"]
    assert len(shared) == 1

    nodes_resp = await auth_api_client.get(f"/tags/{shared[0].id}/nodes")
    assert nodes_resp.status_code == 200, nodes_resp.json()
    paginated = schema.PaginatedResponse[tags_schema.TaggedNodeOut](**nodes_resp.json())
    titles = {item.title for item in paginated.items}
    assert titles == {"A", "B"}


async def test_list_tags_with_tag_select_scope_only_from_db_role(
    db_session: AsyncSession,
    make_user,
    make_role,
):
    """Tag picker catalog is available with ``tag.select`` from DB role."""
    from httpx import ASGITransport, AsyncClient
    from fastapi import FastAPI

    from papermerge.core import dbapi, utils
    from papermerge.core.db.engine import get_db
    from papermerge.core.features.auth.jwt_tokens import sign_access_token
    from papermerge.core.features.auth.scopes import Scopes
    from papermerge.core.features.tags import schema as tags_schema
    from papermerge.core.features.tags.db import api as tags_dbapi
    from papermerge.core.features.tags.router import router as tags_router

    await dbapi.sync_perms(db_session)
    user = await make_user("tagger", is_superuser=False)
    role = await make_role(
        "tag_select_only",
        scopes=[
            Scopes.TAG_SELECT,
            Scopes.USER_ME,
        ],
    )
    user.roles.append(role)
    await db_session.commit()

    await tags_dbapi.create_tag(
        db_session,
        attrs=tags_schema.CreateTag(name="important", user_id=user.id),
    )

    app = FastAPI()
    app.include_router(tags_router, prefix="")

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    token = sign_access_token(
        {
            "sub": str(user.id),
            "preferred_username": user.username,
            "email": user.email,
            "scopes": [Scopes.USER_ME],
            "roles": [],
        }
    )
    transport = ASGITransport(app=app)

    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"Authorization": f"Bearer {token}"},
    ) as client:
        response = await client.get("/tags/all")

    app.dependency_overrides.clear()

    assert response.status_code == 200, response.json()
    names = {schema.Tag(**kw).name for kw in response.json()}
    assert names == {"important"}


async def test_list_tags_with_document_update_tags_scope_from_db_role(
    db_session: AsyncSession,
    make_user,
    make_role,
):
    """Tag picker catalog is available with ``document.update.tags`` from DB role."""
    from httpx import ASGITransport, AsyncClient
    from fastapi import FastAPI

    from papermerge.core import dbapi, utils
    from papermerge.core.db.engine import get_db
    from papermerge.core.features.auth.jwt_tokens import sign_access_token
    from papermerge.core.features.auth.scopes import Scopes
    from papermerge.core.features.tags import schema as tags_schema
    from papermerge.core.features.tags.db import api as tags_dbapi
    from papermerge.core.features.tags.router import router as tags_router

    await dbapi.sync_perms(db_session)
    user = await make_user("tagger", is_superuser=False)
    role = await make_role(
        "tagger_role",
        scopes=[
            Scopes.DOCUMENT_UPDATE_TAGS,
            Scopes.USER_ME,
        ],
    )
    user.roles.append(role)
    await db_session.commit()

    await tags_dbapi.create_tag(
        db_session,
        attrs=tags_schema.CreateTag(name="important", user_id=user.id),
    )

    app = FastAPI()
    app.include_router(tags_router, prefix="")

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    token = sign_access_token(
        {
            "sub": str(user.id),
            "preferred_username": user.username,
            "email": user.email,
            "scopes": [Scopes.USER_ME],
            "roles": [],
        }
    )
    transport = ASGITransport(app=app)

    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"Authorization": f"Bearer {token}"},
    ) as client:
        response = await client.get("/tags/all")

    app.dependency_overrides.clear()

    assert response.status_code == 200, response.json()
    names = {schema.Tag(**kw).name for kw in response.json()}
    assert names == {"important"}
