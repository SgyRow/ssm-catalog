from datetime import datetime
from uuid import uuid4

from papermerge.core.features.library_ts.db import orm as lib_orm
from papermerge.core.tests.types import AuthTestClient


async def _add_entry(db_session, *, user_id, action, resource_type, detail, created_at):
    row = lib_orm.AuditLogEntry(
        id=uuid4(),
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=None,
        detail=detail,
        created_at=created_at,
    )
    db_session.add(row)
    await db_session.flush()
    return row


async def test_audit_log_filters_by_action_and_query(
    auth_api_client: AuthTestClient, db_session, make_user
):
    other = await make_user("audit_other")
    unique_login = "test_audit_login_alpha"
    unique_view = "test_audit_view_omega"
    unique_detail = "opened unique-contract-xyz.pdf"
    await _add_entry(
        db_session,
        user_id=auth_api_client.user.id,
        action=unique_login,
        resource_type="session",
        detail="admin signed in",
        created_at=datetime(2024, 6, 1, 3, 0, 0),
    )
    await _add_entry(
        db_session,
        user_id=other.id,
        action=unique_view,
        resource_type="document",
        detail=unique_detail,
        created_at=datetime(2024, 6, 2, 3, 0, 0),
    )
    await db_session.commit()

    by_action = await auth_api_client.get(f"/library/audit/?action={unique_login}")
    assert by_action.status_code == 200, by_action.json()
    items = by_action.json()["items"]
    assert len(items) == 1
    assert items[0]["action"] == unique_login
    assert items[0]["username"]

    by_query = await auth_api_client.get("/library/audit/?q=unique-contract-xyz")
    assert by_query.status_code == 200, by_query.json()
    q_items = by_query.json()["items"]
    assert len(q_items) == 1
    assert q_items[0]["action"] == unique_view

    by_user = await auth_api_client.get(
        f"/library/audit/?user_id={other.id}&action={unique_view}"
    )
    assert by_user.status_code == 200
    user_items = by_user.json()["items"]
    assert len(user_items) == 1
    assert user_items[0]["user_id"] == str(other.id)

    by_date = await auth_api_client.get(
        f"/library/audit/?action={unique_view}&created_from=2024-06-02&created_to=2024-06-02"
    )
    assert by_date.status_code == 200
    date_items = by_date.json()["items"]
    assert len(date_items) == 1
    assert date_items[0]["action"] == unique_view

    empty_date = await auth_api_client.get(
        f"/library/audit/?action={unique_view}&created_from=2024-06-01&created_to=2024-06-01"
    )
    assert empty_date.status_code == 200
    assert empty_date.json()["items"] == []


async def test_audit_log_forbidden_for_non_superuser(login_as, make_user, db_session):
    member = await make_user("audit_member", is_superuser=False)
    client = await login_as(member)
    response = await client.get("/library/audit/")
    assert response.status_code == 403
