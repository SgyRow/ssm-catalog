async def test_create_move_and_delete_favorite_folder(
    auth_api_client, make_document, user
):
    doc = await make_document(
        title="fav.pdf", parent=user.home_folder, user=user
    )

    created = await auth_api_client.post(
        "/library/favorite-folders/", json={"title": "Договоры"}
    )
    assert created.status_code == 201, created.text
    folder = created.json()
    assert folder["title"] == "Договоры"

    listed = await auth_api_client.get("/library/favorite-folders/")
    assert listed.status_code == 200
    assert any(row["id"] == folder["id"] for row in listed.json())

    add = await auth_api_client.post(f"/library/favorites/{doc.id}/")
    assert add.status_code == 204

    moved = await auth_api_client.patch(
        f"/library/favorites/{doc.id}/", json={"folder_id": folder["id"]}
    )
    assert moved.status_code == 204, moved.text

    favs = await auth_api_client.get("/library/favorites/")
    assert favs.status_code == 200
    row = next(item for item in favs.json() if item["node_id"] == str(doc.id))
    assert row["folder_id"] == folder["id"]

    deleted = await auth_api_client.delete(
        f"/library/favorite-folders/{folder['id']}/"
    )
    assert deleted.status_code == 204

    favs_after = await auth_api_client.get("/library/favorites/")
    row_after = next(
        item for item in favs_after.json() if item["node_id"] == str(doc.id)
    )
    assert row_after["folder_id"] is None


async def test_duplicate_favorite_folder_name(auth_api_client):
    first = await auth_api_client.post(
        "/library/favorite-folders/", json={"title": "Архив"}
    )
    assert first.status_code == 201
    second = await auth_api_client.post(
        "/library/favorite-folders/", json={"title": "архив"}
    )
    assert second.status_code == 409


async def test_cannot_use_another_users_favorite_folder(
    auth_api_client, make_user, make_document, login_as, user
):
    folder = (
        await auth_api_client.post(
            "/library/favorite-folders/", json={"title": "Чужое"}
        )
    ).json()
    other = await make_user("fav_other", is_superuser=True)
    doc = await make_document(
        title="other.pdf", parent=other.home_folder, user=other
    )
    other_client = await login_as(other)
    await other_client.post(f"/library/favorites/{doc.id}/")
    response = await other_client.patch(
        f"/library/favorites/{doc.id}/", json={"folder_id": folder["id"]}
    )
    assert response.status_code == 404
