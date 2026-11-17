"""Folders/files added to favorites/watched from a measure are signed by it."""

from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import orm

pytestmark = pytest.mark.asyncio


async def _create_measure(
    client, user, title: str
) -> dict:
    created_type = await client.post(
        "/msp/types",
        json={
            "name": f"Type {title}",
            "sections": [{"title": "Приём"}],
        },
    )
    assert created_type.status_code == 201, created_type.text
    type_payload = created_type.json()

    created_msp = await client.post(
        "/msp/",
        json={
            "parent_id": str(user.home_folder_id),
            "title": title,
            "msp_type_id": type_payload["id"],
        },
    )
    assert created_msp.status_code == 201, created_msp.text
    return created_msp.json()


async def test_favorite_and_watched_rows_carry_source_measure(
    auth_api_client,
    user,
    db_session: AsyncSession,
    make_folder,
    make_document,
):
    client = auth_api_client.test_client
    msp = await _create_measure(client, user, "Мера подписи")
    anchor = (
        await db_session.execute(
            select(orm.Folder).where(orm.Folder.title == "Мера подписи")
        )
    ).scalar_one()

    folder = await make_folder(title="Федеральные", user=user, parent=anchor)
    doc = await make_document(title="inside.pdf", parent=folder, user=user)
    outside = await make_document(
        title="outside.pdf", parent=user.home_folder, user=user
    )

    for node_id in (anchor.id, folder.id, doc.id, outside.id):
        add_fav = await auth_api_client.post(f"/library/favorites/{node_id}/")
        assert add_fav.status_code == 204, add_fav.text
        add_watched = await auth_api_client.post(f"/library/watched/{node_id}/")
        assert add_watched.status_code == 204, add_watched.text

    for path in ("/library/favorites/", "/library/watched/"):
        listing = await auth_api_client.get(path)
        assert listing.status_code == 200, listing.text
        rows = {row["node_id"]: row for row in listing.json()}

        # The measure's own folder and everything nested inside it is
        # signed by the measure.
        for node_id in (anchor.id, folder.id, doc.id):
            assert rows[str(node_id)]["msp_id"] == msp["id"]
            assert rows[str(node_id)]["msp_title"] == "Мера подписи"

        # Items outside any measure stay unsigned.
        assert rows[str(outside.id)]["msp_id"] is None
        assert rows[str(outside.id)]["msp_title"] is None
