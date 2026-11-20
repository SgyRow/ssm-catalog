import uuid

import pytest
from sqlalchemy import select

from papermerge.core.features.handbook.db import api as hb_api
from papermerge.core.features.handbook.db import orm as hb_orm


@pytest.mark.asyncio
async def test_handbook_folder_crud(db_session, make_user):
    user = await make_user("hb-folder-user")

    folder, err = await hb_api.create_folder(db_session, title=" Инструкции ")
    assert err is None
    assert folder is not None
    assert folder["title"] == "Инструкции"

    dup, err = await hb_api.create_folder(db_session, title="Инструкции")
    assert dup is None
    assert err == "duplicate_title"

    article, err = await hb_api.create_article(
        db_session,
        title="Как работать",
        body="<p>ok</p>",
        author_id=user.id,
        folder_id=folder["id"],
    )
    assert err is None
    assert article is not None
    assert article["folder_id"] == folder["id"]

    renamed, err = await hb_api.update_folder(
        db_session, folder["id"], title="Регламенты"
    )
    assert err is None
    assert renamed is not None
    assert renamed["title"] == "Регламенты"

    ok = await hb_api.delete_folder(db_session, folder["id"])
    assert ok is True

    refreshed = await hb_api.get_article(db_session, article["id"])
    assert refreshed is not None
    assert refreshed["folder_id"] is None

    remaining = (
        await db_session.execute(select(hb_orm.HandbookFolder))
    ).scalars().all()
    assert remaining == []


@pytest.mark.asyncio
async def test_create_article_rejects_missing_folder(db_session, make_user):
    user = await make_user("hb-missing-folder")
    row, err = await hb_api.create_article(
        db_session,
        title="Orphan",
        body="",
        author_id=user.id,
        folder_id=uuid.uuid4(),
    )
    assert row is None
    assert err == "folder_not_found"
