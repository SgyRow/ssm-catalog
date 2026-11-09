async def test_list_includes_gosuslugi(auth_api_client):
    response = await auth_api_client.get("/services")
    assert response.status_code == 200, response.text
    items = response.json()
    slugs = {row["slug"] for row in items}
    assert "gosuslugi" in slugs
    gosuslugi = next(row for row in items if row["slug"] == "gosuslugi")
    assert gosuslugi["title"] == "Госуслуги"
    assert gosuslugi["url"].startswith("https://www.gosuslugi.ru")
    assert gosuslugi["builtin"] is True


async def test_admin_can_create_and_delete_custom_service(auth_api_client):
    created = await auth_api_client.post(
        "/services",
        json={
            "title": "Налоговая",
            "url": "https://www.nalog.gov.ru/",
            "logo_url": None,
        },
    )
    assert created.status_code == 201, created.text
    payload = created.json()
    assert payload["title"] == "Налоговая"
    assert payload["builtin"] is False

    listed = await auth_api_client.get("/services")
    titles = {row["title"] for row in listed.json()}
    assert "Налоговая" in titles

    deleted = await auth_api_client.delete(f"/services/{payload['id']}")
    assert deleted.status_code == 204


async def test_cannot_delete_builtin_gosuslugi(auth_api_client):
    listed = await auth_api_client.get("/services")
    gosuslugi = next(row for row in listed.json() if row["slug"] == "gosuslugi")
    response = await auth_api_client.delete(f"/services/{gosuslugi['id']}")
    assert response.status_code == 400


async def test_non_admin_cannot_create_service(login_as, make_user):
    member = await make_user("svc_member", is_superuser=False)
    client = await login_as(member)
    response = await client.post(
        "/services",
        json={"title": "Other", "url": "https://example.com/"},
    )
    assert response.status_code == 403
