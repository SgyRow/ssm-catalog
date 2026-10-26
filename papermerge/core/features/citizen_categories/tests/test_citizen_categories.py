from papermerge.core.features.auth.scopes import Scopes
from papermerge.core.tests.types import AuthTestClient


def test_citizen_category_scopes_declared():
    all_s = Scopes.all_scopes()
    assert Scopes.CITIZEN_CATEGORY_VIEW in all_s
    assert Scopes.CITIZEN_CATEGORY_CREATE in all_s
    assert Scopes.CITIZEN_CATEGORY_UPDATE in all_s
    assert Scopes.CITIZEN_CATEGORY_DELETE in all_s


async def test_citizen_category_crud_and_folder_assignment(
    auth_api_client: AuthTestClient,
    make_folder,
    user,
):
    create_resp = await auth_api_client.post(
        "/citizen-categories",
        json={"name": "Veterans", "description": "Veterans support"},
    )
    assert create_resp.status_code == 201, create_resp.json()
    category = create_resp.json()

    update_resp = await auth_api_client.patch(
        f"/citizen-categories/{category['id']}",
        json={"name": "Veterans updated", "description": "Updated description"},
    )
    assert update_resp.status_code == 200, update_resp.json()
    assert update_resp.json()["name"] == "Veterans updated"
    assert update_resp.json()["description"] == "Updated description"

    list_resp = await auth_api_client.get("/citizen-categories")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1
    assert list_resp.json()[0]["name"] == "Veterans updated"

    folder = await make_folder(title="Vet folder", user=user, parent=user.home_folder)
    assign_resp = await auth_api_client.put(
        f"/citizen-categories/folders/{folder.id}",
        json={"category_ids": [category["id"]]},
    )
    assert assign_resp.status_code == 200, assign_resp.json()
    assert len(assign_resp.json()) == 1

    folders_resp = await auth_api_client.get(
        f"/citizen-categories/{category['id']}/folders"
    )
    assert folders_resp.status_code == 200
    assert len(folders_resp.json()) == 1
    assert folders_resp.json()[0]["node_id"] == str(folder.id)
