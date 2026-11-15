from sqlalchemy.ext.asyncio import AsyncSession
from papermerge.core import orm, dbapi


async def test_user_groups(db_session: AsyncSession, make_user, make_group):
    """User details should return all user's groups"""
    user: orm.User = await make_user("momo", is_superuser=False)
    group: orm.Group = await make_group("family")

    user.groups.append(group)
    db_session.add(user)
    await db_session.commit()

    user_details, err = await dbapi.get_user_details(db_session, user.id)

    assert err is None
    assert "family" in [g.name for g in user_details.groups]


async def test_user_roles(db_session: AsyncSession, make_user, make_role):
    """User details should return all user's roles"""
    user: orm.User = await make_user("momo", is_superuser=False)
    role: orm.Role = await make_role("employee")

    db_session.add_all([user, role])
    user.roles.append(role)
    db_session.add(user)
    await db_session.commit()

    user_details, err = await dbapi.get_user_details(db_session, user.id)

    assert err is None
    assert "employee" in [r.name for r in user_details.roles]


async def test_user_scopes(db_session: AsyncSession, make_user, make_role):
    """User details should return all user's scopes"""
    await dbapi.sync_perms(db_session)
    user: orm.User = await make_user("momo", is_superuser=False)
    role: orm.Role = await make_role("employee", scopes=["node.create", "node.view"])

    user.roles.append(role)
    db_session.add(user)
    await db_session.commit()

    user_details, err = await dbapi.get_user_details(db_session, user.id)

    assert err is None
    assert "node.create" in [scope for scope in user_details.scopes]
    assert "node.view" in [scope for scope in user_details.scopes]


async def test_user_details_with_shared_role_serializes(
    db_session: AsyncSession, make_user, make_role
):
    """A second user on the same role must not break details for anyone.

    Registration assigns ``employee`` by mutating Role.users. Serializing
    ORM roles then walks that back-ref and can hang or 500 for every user.
    """
    await dbapi.sync_perms(db_session)
    role = await make_role("employee", scopes=["node.view", "user.view"])
    admin = await make_user("admin_viewer", is_superuser=True)
    newbie = await make_user("new_employee", is_superuser=False)

    admin.roles.append(role)
    newbie.roles.append(role)
    db_session.add_all([admin, newbie])
    await db_session.commit()

    for target in (admin, newbie):
        details, err = await dbapi.get_user_details(db_session, target.id)
        assert err is None
        payload = details.model_dump(mode="json")
        assert [r["name"] for r in payload["roles"]] == ["employee"]
        assert "users" not in payload["roles"][0]
        assert "permissions" not in payload["roles"][0]
        assert "password" not in payload
