"""Trash listing, group-owned soft-delete, and document revive on re-upload."""

from datetime import datetime

import pytest
from sqlalchemy import select, update

from papermerge.core import orm, schema
from papermerge.core.features.document import schema as doc_schema
from papermerge.core.features.document.db import api as doc_dbapi
from papermerge.core.features.groups.db.orm import user_groups_association
from papermerge.core.features.nodes.db import api as nodes_dbapi


@pytest.mark.asyncio
async def test_list_trash_includes_group_owned_document(
    db_session, make_user, make_group, make_document
):
    user = await make_user("trash_group_user")
    group = await make_group("legal_portal", with_special_folders=True)
    await db_session.execute(
        user_groups_association.insert().values(
            user_id=user.id,
            group_id=group.id,
        )
    )
    await db_session.commit()

    doc = await make_document(
        title="regional-law.docx",
        parent=group.home_folder,
    )
    assert (await db_session.get(orm.Node, doc.id)).group_id == group.id

    await db_session.execute(
        update(orm.Node).where(orm.Node.id == doc.id).values(deleted_at=datetime.utcnow())
    )
    await db_session.commit()

    page = await nodes_dbapi.list_trash_nodes(
        db_session, user_id=user.id, page_size=50, page_number=1
    )
    assert page.num_pages >= 1
    assert any(item.id == doc.id for item in page.items)


@pytest.mark.asyncio
async def test_create_document_revives_trashed_copy(
    db_session, make_user, make_document
):
    user = await make_user("trash_revive_doc")
    parent = user.home_folder
    title = "duplicate-after-delete.docx"

    doc = await make_document(title=title, user=user, parent=parent)
    await db_session.execute(
        update(orm.Node).where(orm.Node.id == doc.id).values(deleted_at=datetime.utcnow())
    )
    await db_session.commit()

    revived, error = await doc_dbapi.create_document(
        db_session,
        doc_schema.NewDocument(title=title, parent_id=parent.id),
    )
    assert error is None, error
    assert revived is not None
    assert revived.id == doc.id

    row = await db_session.get(orm.Node, doc.id)
    assert row is not None
    assert row.deleted_at is None


@pytest.mark.asyncio
async def test_create_document_allows_same_title_while_other_copy_in_trash(
    db_session, make_user, make_document
):
    """With partial unique indexes, a new row is allowed if the old one is trashed."""
    user = await make_user("trash_new_doc")
    parent = user.home_folder
    title = "second-copy.docx"

    first = await make_document(title=title, user=user, parent=parent)
    await db_session.execute(
        update(orm.Node)
        .where(orm.Node.id == first.id)
        .values(deleted_at=datetime.utcnow())
    )
    await db_session.commit()

    # Revive path returns the trashed document; simulate wanting a fresh node by
    # hard-deleting the trashed row first.
    await db_session.delete(await db_session.get(orm.Node, first.id))
    await db_session.commit()

    second, error = await doc_dbapi.create_document(
        db_session,
        doc_schema.NewDocument(title=title, parent_id=parent.id),
    )
    assert error is None, error
    assert second is not None
    assert second.id != first.id
