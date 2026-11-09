"""Tests for the МСП (Measures of Social Support) router."""

import pytest

pytestmark = pytest.mark.asyncio


async def test_types_and_msp_crud_and_pdf(auth_api_client, db_session, user):
    """Full flow: create a type, a measure, fetch it, and render a PDF."""
    client = auth_api_client.test_client

    # Create a measure type with two sections.
    resp = await client.post(
        "/msp/types",
        json={
            "name": "ЕДК",
            "description": "Единоличный документ",
            "sections": [{"title": "Приём"}, {"title": "Назначение"}],
        },
    )
    assert resp.status_code == 201, resp.text
    type_payload = resp.json()
    type_id = type_payload["id"]
    assert [s["title"] for s in type_payload["sections"]] == ["Приём", "Назначение"]
    section_by_title = {s["title"]: s["id"] for s in type_payload["sections"]}

    # Create a measure anchored to the user's home folder.
    resp = await client.post(
        "/msp/",
        json={
            "parent_id": str(user.home_folder_id),
            "title": "ЕДК для семей с детьми",
            "msp_type_id": type_id,
            "sections": [
                {"type_section_id": section_by_title["Приём"], "body": "Нужен паспорт."},
                # Empty section -> must not be stored.
                {"type_section_id": section_by_title["Назначение"], "body": "   "},
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    msp = resp.json()
    assert msp["title"] == "ЕДК для семей с детьми"
    assert msp["msp_type_name"] == "ЕДК"
    # Only the non-empty section is kept.
    assert len(msp["sections"]) == 1
    assert msp["sections"][0]["title"] == "Приём"
    assert msp["sections"][0]["body"] == "Нужен паспорт."
    msp_id = msp["id"]
    node_id = msp["node_id"]

    # Fetch by id.
    resp = await client.get(f"/msp/{msp_id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["title"] == "ЕДК для семей с детьми"

    # Fetch by anchor node.
    resp = await client.get(f"/msp/by-node/{node_id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["id"] == msp_id

    # Update the measure: rename and change a section body.
    resp = await client.put(
        f"/msp/{msp_id}",
        json={
            "title": "ЕДК (обновлённая)",
            "sections": [
                {"type_section_id": section_by_title["Приём"], "body": "Нужен паспорт и СНИЛС."},
                {"type_section_id": section_by_title["Назначение"], "body": "Назначается ежемесячно."},
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    updated = resp.json()
    assert updated["title"] == "ЕДК (обновлённая)"
    assert len(updated["sections"]) == 2

    # Render the PDF on demand.
    resp = await client.get(f"/msp/{msp_id}/pdf")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:5] == b"%PDF-"
    assert resp.content.rstrip().endswith(b"%%EOF")
    # A real, multi-section document — not an empty shell.
    assert len(resp.content) > 20_000

    # Delete the measure (and its anchor node).
    resp = await client.delete(f"/msp/{msp_id}")
    assert resp.status_code == 204

    # The measure is gone.
    resp = await client.get(f"/msp/{msp_id}")
    assert resp.status_code == 404

    # A node that has no measure returns an empty result (200 + null), not 404.
    resp = await client.get(f"/msp/by-node/{user.home_folder_id}")
    assert resp.status_code == 200
    assert resp.json() is None


async def test_list_types(auth_api_client, db_session):
    client = auth_api_client.test_client

    resp = await client.post(
        "/msp/types",
        json={"name": "ЕДВ", "sections": [{"title": "Описание"}]},
    )
    assert resp.status_code == 201, resp.text

    resp = await client.get("/msp/types")
    assert resp.status_code == 200, resp.text
    names = [t["name"] for t in resp.json()]
    assert "ЕДВ" in names


async def test_update_type_sections(auth_api_client, db_session):
    client = auth_api_client.test_client

    resp = await client.post(
        "/msp/types",
        json={
            "name": "ЕДВ-редакт",
            "description": "старое",
            "sections": [{"title": "Приём"}, {"title": "Удалить"}],
        },
    )
    assert resp.status_code == 201, resp.text
    type_id = resp.json()["id"]
    by_title = {s["title"]: s["id"] for s in resp.json()["sections"]}

    resp = await client.patch(
        f"/msp/types/{type_id}",
        json={
            "name": "ЕДВ",
            "description": "новое",
            "sections": [
                {"id": by_title["Приём"], "title": "Приём документов"},
                {"title": "Назначение"},
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["name"] == "ЕДВ"
    assert payload["description"] == "новое"
    titles = [s["title"] for s in payload["sections"]]
    assert titles == ["Приём документов", "Назначение"]
    assert payload["sections"][0]["id"] == by_title["Приём"]


async def test_add_section_to_type(auth_api_client, db_session):
    client = auth_api_client.test_client

    resp = await client.post(
        "/msp/types", json={"name": "Компенсации", "sections": [{"title": "Основание"}]}
    )
    assert resp.status_code == 201, resp.text
    type_id = resp.json()["id"]
    initial_count = len(resp.json()["sections"])

    resp = await client.post(f"/msp/types/{type_id}/sections", json={"title": "Размер"})
    assert resp.status_code == 201, resp.text

    resp = await client.get(f"/msp/types/{type_id}")
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["sections"]) == initial_count + 1
    assert resp.json()["sections"][-1]["title"] == "Размер"


async def test_delete_type(auth_api_client, db_session):
    client = auth_api_client.test_client

    resp = await client.post("/msp/types", json={"name": "Временный", "sections": []})
    assert resp.status_code == 201, resp.text
    type_id = resp.json()["id"]

    resp = await client.delete(f"/msp/types/{type_id}")
    assert resp.status_code == 204

    resp = await client.get(f"/msp/types/{type_id}")
    assert resp.status_code == 404


async def test_non_admin_cannot_create_type(db_session, make_user, login_as):
    """Only an admin (superuser) may create measure types."""
    # A plain, non-superuser account.
    member = await make_user("msp_member", is_superuser=False)
    member_client = await login_as(member)

    resp = await member_client.test_client.post(
        "/msp/types",
        json={"name": "Попытка", "sections": [{"title": "Раздел"}]},
    )
    assert resp.status_code == 403, resp.text
