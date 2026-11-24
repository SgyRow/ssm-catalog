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

    # Top level: only informational materials (normative acts are virtual).
    top_titles = await _folder_titles(db_session, node_id)
    assert set(top_titles) == {"Информационные материалы"}

    info_id = (
        await db_session.scalars(
            select(nodes_orm.Folder).where(
                nodes_orm.Folder.parent_id == node_id,
                nodes_orm.Folder.title == "Информационные материалы",
                nodes_orm.Folder.ctype == "folder",
                nodes_orm.Folder.deleted_at.is_(None),
            )
        )
    ).one().id

    assert set(await _folder_titles(db_session, info_id)) == {
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


async def test_add_section_at_position(auth_api_client, db_session):
    client = auth_api_client.test_client

    resp = await client.post(
        "/msp/types",
        json={"name": "ЕДК-вставка", "sections": [{"title": "A"}, {"title": "B"}, {"title": "C"}]},
    )
    assert resp.status_code == 201, resp.text
    type_id = resp.json()["id"]

    # Insert between the first and the second section.
    resp = await client.post(
        f"/msp/types/{type_id}/sections", json={"title": "X", "index": 1}
    )
    assert resp.status_code == 201, resp.text
    resp = await client.get(f"/msp/types/{type_id}")
    assert resp.status_code == 200, resp.text
    assert [s["title"] for s in resp.json()["sections"]] == ["A", "X", "B", "C"]

    # Insert at the very beginning.
    resp = await client.post(
        f"/msp/types/{type_id}/sections", json={"title": "0", "index": 0}
    )
    assert resp.status_code == 201, resp.text

    # Out-of-range index clamps to the end (same as omitting index).
    resp = await client.post(
        f"/msp/types/{type_id}/sections", json={"title": "Z", "index": 99}
    )
    assert resp.status_code == 201, resp.text
    resp = await client.get(f"/msp/types/{type_id}")
    assert [s["title"] for s in resp.json()["sections"]] == ["0", "A", "X", "B", "C", "Z"]
    sort_orders = [s["sort_order"] for s in resp.json()["sections"]]
    assert sort_orders == list(range(len(sort_orders)))


async def test_reorder_type_sections(auth_api_client, db_session):
    client = auth_api_client.test_client

    resp = await client.post(
        "/msp/types",
        json={
            "name": "ЕДК-перенос",
            "sections": [{"title": "A"}, {"title": "B"}, {"title": "C"}],
        },
    )
    assert resp.status_code == 201, resp.text
    type_id = resp.json()["id"]
    by_title = {s["title"]: s["id"] for s in resp.json()["sections"]}

    # Move "C" to the front.
    resp = await client.post(
        f"/msp/types/{type_id}/sections/reorder",
        json={"order": [by_title["C"], by_title["A"], by_title["B"]]},
    )
    assert resp.status_code == 200, resp.text
    assert [s["title"] for s in resp.json()["sections"]] == ["C", "A", "B"]

    # The persisted order survives a refetch.
    resp = await client.get(f"/msp/types/{type_id}")
    assert resp.status_code == 200, resp.text
    assert [s["title"] for s in resp.json()["sections"]] == ["C", "A", "B"]

    # An invalid order (missing id) is rejected with 400.
    resp = await client.post(
        f"/msp/types/{type_id}/sections/reorder",
        json={"order": [by_title["C"], by_title["A"]]},
    )
    assert resp.status_code == 400, resp.text

    # A type that does not exist -> 404.
    resp = await client.post(
        "/msp/types/00000000-0000-4000-8000-000000000000/sections/reorder",
        json={"order": []},
    )
    assert resp.status_code == 404, resp.text


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


async def test_normative_registry_and_links(
    auth_api_client, db_session, user, make_document
):
    """Central NPA registry + attach/unlink links on a new-template measure."""
    from papermerge.core.features.msp.db import api as msp_api
    from papermerge.core.features.msp.folder_template import (
        NORMATIVE_BUCKET_FEDERAL,
        NORMATIVE_REGISTRY_FOLDER,
    )
    from papermerge.core.features.portal.db import api as portal_dbapi

    client = auth_api_client.test_client

    root_id, group_id, err = await portal_dbapi.ensure_portal_bootstrap(db_session)
    assert err is None and root_id and group_id

    # Superuser can view portal-owned nodes via NODE_VIEW / portal.view paths;
    # grant access by also ensuring registry then creating a doc under it.
    registry_id, buckets, reg_err = await msp_api.ensure_normative_registry(db_session)
    assert reg_err is None and registry_id
    await db_session.commit()

    federal_id = buckets[NORMATIVE_BUCKET_FEDERAL]
    federal_folder = (
        await db_session.scalars(
            select(nodes_orm.Folder).where(nodes_orm.Folder.id == federal_id)
        )
    ).one()
    doc = await make_document(title="ФЗ-тест.pdf", parent=federal_folder, user=user)
    await db_session.commit()

    resp = await client.get("/msp/normative-registry")
    assert resp.status_code == 200, resp.text
    reg = resp.json()
    assert reg["title"] == NORMATIVE_REGISTRY_FOLDER
    assert {b["title"] for b in reg["buckets"]} == {"Федеральные", "Региональные"}

    resp = await client.post(
        "/msp/types",
        json={"name": "ЕДК-НПА", "sections": [{"title": "Приём"}]},
    )
    assert resp.status_code == 201, resp.text
    type_id = resp.json()["id"]

    resp = await client.post(
        "/msp/",
        json={
            "parent_id": str(user.home_folder_id),
            "title": "Мера со ссылками НПА",
            "msp_type_id": type_id,
            "sections": [{"title": "Приём", "body": "Текст"}],
        },
    )
    assert resp.status_code == 201, resp.text
    msp_id = resp.json()["id"]

    resp = await client.get(f"/msp/{msp_id}/normative-folders")
    assert resp.status_code == 200, resp.text
    folders = resp.json()
    assert {f["title"] for f in folders} == {"Федеральные", "Региональные"}
    federal_folder_id = next(f["id"] for f in folders if f["title"] == "Федеральные")

    resp = await client.post(
        f"/msp/{msp_id}/normative-folders",
        json={"title": "Консультационные письма"},
    )
    assert resp.status_code == 201, resp.text
    custom_folder_id = resp.json()["id"]

    resp = await client.patch(
        f"/msp/{msp_id}/normative-folders/{custom_folder_id}",
        json={"title": "Письма МСЗ"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["title"] == "Письма МСЗ"

    resp = await client.post(
        f"/msp/{msp_id}/normative-links",
        json={"document_id": str(doc.id), "folder_id": federal_folder_id},
    )
    assert resp.status_code == 201, resp.text
    link = resp.json()
    assert link["document_id"] == str(doc.id)
    assert link["folder_id"] == federal_folder_id
    assert link["title"] == "ФЗ-тест.pdf"
    link_id = link["id"]

    resp = await client.get(f"/msp/by-document/{doc.id}")
    assert resp.status_code == 200, resp.text
    refs = resp.json()
    assert len(refs) == 1
    assert refs[0]["msp_id"] == msp_id
    assert refs[0]["title"] == "Мера со ссылками НПА"
    assert refs[0]["folder_title"] == "Федеральные"
    assert refs[0]["node_id"]

    resp = await client.get(f"/msp/{msp_id}/normative-folders")
    assert resp.status_code == 200, resp.text
    federal = next(f for f in resp.json() if f["id"] == federal_folder_id)
    assert len(federal["links"]) == 1

    # Duplicate attach is rejected.
    resp = await client.post(
        f"/msp/{msp_id}/normative-links",
        json={"document_id": str(doc.id), "folder_id": custom_folder_id},
    )
    assert resp.status_code == 400, resp.text

    resp = await client.delete(f"/msp/{msp_id}/normative-links/{link_id}")
    assert resp.status_code == 204

    resp = await client.delete(
        f"/msp/{msp_id}/normative-folders/{custom_folder_id}"
    )
    assert resp.status_code == 204

    resp = await client.get(f"/msp/{msp_id}/normative-folders")
    assert resp.status_code == 200, resp.text
    assert {f["title"] for f in resp.json()} == {"Федеральные", "Региональные"}

    # Document itself still exists under the registry.
    still = (
        await db_session.scalars(
            select(nodes_orm.Node).where(nodes_orm.Node.id == doc.id)
        )
    ).one_or_none()
    assert still is not None
    assert still.parent_id == federal_id
