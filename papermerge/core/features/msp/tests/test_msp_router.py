"""Tests for the МСП (Measures of Social Support) router."""

import pytest
from sqlalchemy import select

from papermerge.core.features.nodes.db import orm as nodes_orm

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

    # Per-measure rename + hide: the section titles are renamed and one
    # section is hidden for this measure only — the type is not touched.
    resp = await client.put(
        f"/msp/{msp_id}",
        json={
            "title": "ЕДК (обновлённая)",
            "sections": [
                {
                    "type_section_id": section_by_title["Приём"],
                    "title": "Приём документов",
                    "body": "Нужен паспорт и СНИЛС.",
                    "hidden": False,
                },
                {
                    "type_section_id": section_by_title["Назначение"],
                    "body": "Назначается ежемесячно.",
                    "hidden": True,
                },
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    updated = resp.json()
    by_title = {s["title"]: s for s in updated["sections"]}
    assert "Приём документов" in by_title
    assert by_title["Приём документов"]["hidden"] is False
    assert by_title["Назначение"]["hidden"] is True

    # The type (template) was not renamed.
    resp = await client.get(f"/msp/types/{type_id}")
    assert resp.status_code == 200, resp.text
    assert [s["title"] for s in resp.json()["sections"]] == ["Приём", "Назначение"]

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


async def _folder_titles(db_session, parent_id):
    stmt = select(nodes_orm.Folder.title).where(
        nodes_orm.Folder.parent_id == parent_id,
        nodes_orm.Folder.ctype == "folder",
        nodes_orm.Folder.deleted_at.is_(None),
    )
    return sorted((await db_session.scalars(stmt)).all())


async def test_create_msp_creates_default_folders(auth_api_client, db_session, user):
    """A measure folder gets the standard two-folder template inside."""
    client = auth_api_client.test_client

    resp = await client.post(
        "/msp/types",
        json={"name": "ЕДК-папки", "sections": [{"title": "Приём"}]},
    )
    assert resp.status_code == 201, resp.text
    type_id = resp.json()["id"]

    resp = await client.post(
        "/msp/",
        json={
            "parent_id": str(user.home_folder_id),
            "title": "Мера с папками",
            "msp_type_id": type_id,
            "sections": [{"title": "Приём", "body": "Текст"}],
        },
    )
    assert resp.status_code == 201, resp.text
    node_id = resp.json()["node_id"]

    # Top level: exactly the two standard folders.
    top_titles = await _folder_titles(db_session, node_id)
    assert set(top_titles) == {
        "Нормативные правовые документы",
        "Информационные материалы",
    }

    # Each top folder has its subfolders.
    folder_by_title = {}
    for title in top_titles:
        folder_id = (
            await db_session.scalars(
                select(nodes_orm.Folder).where(
                    nodes_orm.Folder.parent_id == node_id,
                    nodes_orm.Folder.title == title,
                    nodes_orm.Folder.ctype == "folder",
                    nodes_orm.Folder.deleted_at.is_(None),
                )
            )
        ).one().id
        folder_by_title[title] = folder_id

    assert set(
        await _folder_titles(db_session, folder_by_title["Нормативные правовые документы"])
    ) == {"Федеральные", "Региональные"}
    assert set(
        await _folder_titles(db_session, folder_by_title["Информационные материалы"])
    ) == {
        "Бланки заявлений",
        "На стенды",
        "Раздаточные материалы",
        "Видеоматериалы",
        "Методические пособия",
    }


def test_build_msp_html_respects_hidden_and_renames():
    """Hidden sections are excluded from the PDF HTML; renames render as-is."""
    import uuid

    from papermerge.core.features.msp.db import orm
    from papermerge.core.features.msp.pdf import build_msp_html

    msp = orm.Msp(node_id=uuid.uuid4(), msp_type_id=uuid.uuid4())
    s1 = orm.MspSection(
        msp_id=msp.id,
        title="Приём документов",
        body="Нужен паспорт.",
        hidden=False,
        sort_order=0,
    )
    s2 = orm.MspSection(
        msp_id=msp.id,
        title="Назначение",
        body="Скрытый текст.",
        hidden=True,
        sort_order=1,
    )
    msp.sections.extend([s1, s2])

    html = build_msp_html(msp, "Мера")
    assert "Приём документов" in html
    assert "Нужен паспорт." in html
    assert "Назначение" not in html
    assert "Скрытый текст." not in html


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
