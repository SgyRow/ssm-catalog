import pytest

pytestmark = pytest.mark.asyncio


async def test_favorite_and_watch_msp_folder_and_section(auth_api_client, user):
    client = auth_api_client.test_client

    created_type = await client.post(
        "/msp/types",
        json={
            "name": "Bookmark type",
            "sections": [{"title": "Приём"}, {"title": "Назначение"}],
        },
    )
    assert created_type.status_code == 201, created_type.text
    type_payload = created_type.json()
    section_by_title = {s["title"]: s["id"] for s in type_payload["sections"]}

    created_msp = await client.post(
        "/msp/",
        json={
            "parent_id": str(user.home_folder_id),
            "title": "Мера для закладок",
            "msp_type_id": type_payload["id"],
            "sections": [
                {
                    "type_section_id": section_by_title["Приём"],
                    "body": "Нужен паспорт.",
                }
            ],
        },
    )
    assert created_msp.status_code == 201, created_msp.text
    msp = created_msp.json()
    node_id = msp["node_id"]
    type_section_id = section_by_title["Приём"]

    add_folder = await auth_api_client.post(f"/library/favorites/{node_id}/")
    assert add_folder.status_code == 204, add_folder.text
    watch_folder = await auth_api_client.post(f"/library/watched/{node_id}/")
    assert watch_folder.status_code == 204, watch_folder.text

    add_section = await auth_api_client.post(
        "/library/msp-section-favorites/",
        json={"msp_id": msp["id"], "type_section_id": type_section_id},
    )
    assert add_section.status_code == 204, add_section.text
    watch_section = await auth_api_client.post(
        "/library/msp-section-watched/",
        json={"msp_id": msp["id"], "type_section_id": type_section_id},
    )
    assert watch_section.status_code == 204, watch_section.text

    favs = await auth_api_client.get("/library/favorites/")
    assert favs.status_code == 200
    fav_rows = favs.json()
    assert any(
        row["node_id"] == node_id and row.get("type_section_id") is None
        for row in fav_rows
    )
    section_fav = next(
        row
        for row in fav_rows
        if row.get("type_section_id") == type_section_id
    )
    assert section_fav["ctype"] == "msp_section"
    assert section_fav["msp_id"] == msp["id"]
    assert "Приём" in section_fav["title"]

    watched = await auth_api_client.get("/library/watched/")
    assert watched.status_code == 200
    watched_rows = watched.json()
    assert any(
        row["node_id"] == node_id and row.get("type_section_id") is None
        for row in watched_rows
    )
    assert any(
        row.get("type_section_id") == type_section_id for row in watched_rows
    )

    # Section id is rewritten on update; bookmark stays keyed by type_section_id.
    updated = await client.put(
        f"/msp/{msp['id']}",
        json={
            "sections": [
                {
                    "type_section_id": type_section_id,
                    "body": "Нужен паспорт и СНИЛС.",
                }
            ]
        },
    )
    assert updated.status_code == 200, updated.text
    favs_after = await auth_api_client.get("/library/favorites/")
    assert any(
        row.get("type_section_id") == type_section_id
        for row in favs_after.json()
    )

    removed = await auth_api_client.delete(
        f"/library/msp-section-favorites/{msp['id']}/{type_section_id}/"
    )
    assert removed.status_code == 204
    unwatched = await auth_api_client.delete(
        f"/library/msp-section-watched/{msp['id']}/{type_section_id}/"
    )
    assert unwatched.status_code == 204
