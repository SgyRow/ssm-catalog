"""Built-in role preset definitions must stay aligned with auth scopes."""

from papermerge.core.features.auth.scopes import Scopes
from papermerge.core.features.roles import test_role_presets


def test_moderator_has_every_scope():
    assert set(test_role_presets.full_access_scopes()) == Scopes.all_scopes()


def test_employee_scopes_are_valid():
    employee = set(test_role_presets.employee_scopes())
    all_scopes = Scopes.all_scopes()
    assert employee <= all_scopes


def test_employee_is_read_only_for_nodes_and_documents():
    employee = set(test_role_presets.employee_scopes())
    forbidden = {
        Scopes.NODE_CREATE,
        Scopes.NODE_UPDATE,
        Scopes.NODE_DELETE,
        Scopes.NODE_MOVE,
        Scopes.DOCUMENT_UPLOAD,
        Scopes.PAGE_UPDATE,
        Scopes.PAGE_MOVE,
        Scopes.PAGE_EXTRACT,
        Scopes.PAGE_DELETE,
        Scopes.PAGE_REORDER,
        Scopes.PAGE_ROTATE,
        Scopes.TAG_CREATE,
        Scopes.TAG_UPDATE,
        Scopes.TAG_DELETE,
        Scopes.USER_CREATE,
        Scopes.USER_UPDATE,
        Scopes.USER_DELETE,
        Scopes.USER_VIEW,
        Scopes.ROLE_CREATE,
        Scopes.ROLE_UPDATE,
        Scopes.ROLE_DELETE,
        Scopes.ROLE_VIEW,
        Scopes.PORTAL_FEED_MANAGE,
        Scopes.PORTAL_SECTION_CREATE,
        Scopes.PORTAL_SECTION_UPDATE,
        Scopes.PORTAL_SECTION_DELETE,
        Scopes.PORTAL_DOCUMENT_UPLOAD,
        Scopes.PORTAL_DOCUMENT_UPDATE,
        Scopes.PORTAL_DOCUMENT_DELETE,
        Scopes.CITIZEN_CATEGORY_CREATE,
        Scopes.CITIZEN_CATEGORY_UPDATE,
        Scopes.CITIZEN_CATEGORY_DELETE,
    }
    assert employee.isdisjoint(forbidden)


def test_employee_can_collaborate():
    employee = set(test_role_presets.employee_scopes())
    assert Scopes.COMMENT_CREATE in employee
    assert Scopes.COMMENT_UPDATE not in employee
    assert Scopes.COMMENT_DELETE not in employee
    assert Scopes.NODE_VIEW in employee
    assert Scopes.COMMANDER_VIEW in employee
    assert Scopes.DOCUMENT_DOWNLOAD in employee
    assert Scopes.CITIZEN_CATEGORY_VIEW in employee


async def test_update_role_rejects_unknown_scopes(db_session):
    from papermerge.core.features.roles import schema
    from papermerge.core.features.roles.db import api as dbapi

    await dbapi.sync_perms(db_session)
    role, _ = await dbapi.create_role(
        db_session, "demo", scopes=["tag.view"], exists_ok=False
    )

    updated, error = await dbapi.update_role(
        db_session,
        role_id=role.id,
        attrs=schema.UpdateRole(
            name="demo",
            scopes=["tag.view", "not-a-real-scope"],
        ),
    )

    assert updated is None
    assert error is not None
    assert "not-a-real-scope" in error

    details = await dbapi.get_role(db_session, role.id)
    assert details.scopes == ["tag.view"]

    await dbapi.delete_role(db_session, role.id)


async def test_ensure_preset_roles(db_session):
    from papermerge.core.features.roles.db import api as dbapi

    await dbapi.sync_perms(db_session)
    results = await test_role_presets.ensure_all_preset_roles(db_session)

    for name, details, err in results:
        assert err is None, f"{name}: {err}"
        assert details is not None
        if name == test_role_presets.MODERATOR_ROLE_NAME:
            assert set(details.scopes) == Scopes.all_scopes()
        elif name == test_role_presets.EMPLOYEE_ROLE_NAME:
            assert set(details.scopes) == set(test_role_presets.employee_scopes())
