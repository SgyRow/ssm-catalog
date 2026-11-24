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


@pytest.mark.asyncio
async def test_handbook_author_uses_display_name(db_session, make_user):
    user = await make_user("hb-author-login")
    user.first_name = "Иван"
    user.last_name = "Петров"
    await db_session.flush()

    article, err = await hb_api.create_article(
        db_session,
        title="Статья",
        body="",
        author_id=user.id,
    )
    assert err is None
    assert article is not None
    assert article["author_username"] == "Иван Петров"

    listed = await hb_api.list_articles(db_session)
    match = next(item for item in listed if item["id"] == article["id"])
    assert match["author_username"] == "Иван Петров"


def test_title_from_filename_strips_extension():
    assert hb_api.title_from_filename("Регламент.pdf") == "Регламент"
    assert hb_api.title_from_filename("notes.docx") == "notes"
    assert hb_api.title_from_filename("noext") == "noext"
    assert hb_api.title_from_filename(".gitignore") == ".gitignore"


@pytest.mark.asyncio
async def test_replace_file_document_bumps_url_stamp(db_session, make_user, tmp_path, monkeypatch):
    """Replace must rewrite bytes and change the download URL stamp.

    Same filename/size used to leave updated_at untouched (ORM stayed clean),
    so the SPA kept showing the previous preview from a cached URL.
    """
    monkeypatch.setattr(
        "papermerge.core.features.handbook.db.api.get_settings",
        lambda: type(
            "S",
            (),
            {"papermerge__main__media_root": str(tmp_path)},
        )(),
    )
    user = await make_user("hb-replace-file")
    created, err = await hb_api.create_file_document(
        db_session,
        title="Правила",
        author_id=user.id,
        filename="rules.pdf",
        content_type="application/pdf",
        data=b"%PDF-1.4 old-content-xx",
    )
    assert err is None
    assert created is not None
    article_id = created["id"]
    old_url = created["file"]["url"]
    old_updated = created["updated_at"]

    replaced = await hb_api.replace_file_document(
        db_session,
        article_id,
        filename="rules.pdf",
        content_type="application/pdf",
        data=b"%PDF-1.4 new-content-xx",
    )
    assert replaced is not None
    assert replaced["file"]["filename"] == "rules.pdf"
    assert replaced["file"]["size_bytes"] == len(b"%PDF-1.4 new-content-xx")
    assert replaced["updated_at"] != old_updated
    assert replaced["file"]["url"] != old_url
    assert "?v=" in replaced["file"]["url"]

    stored = await hb_api.get_file_document(db_session, article_id)
    assert stored is not None
    _, path = stored
    assert path.read_bytes() == b"%PDF-1.4 new-content-xx"
