"""Document full-version attachments."""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import orm
from papermerge.core.features.auth.scopes import Scopes
from papermerge.core.features.library_ts.db import api as lib_ts_api
from papermerge.core.features.roles.test_role_presets import employee_scopes


@pytest.mark.asyncio
async def test_employee_preset_includes_full_version_view():
    assert Scopes.DOCUMENT_FULL_VERSION_VIEW in employee_scopes()


@pytest.mark.asyncio
async def test_replace_and_list_full_version_attachments(
    db_session: AsyncSession,
    make_user,
    make_document,
):
    user = await make_user("fv_owner", is_superuser=False)
    preview = await make_document(
        title="preview.pdf", parent=user.home_folder, user=user
    )
    full = await make_document(
        title="full.pdf", parent=user.home_folder, user=user
    )
    await db_session.commit()

    await lib_ts_api.replace_full_version_attachments(
        db_session, preview.id, [full.id]
    )
    await db_session.commit()

    rows = await lib_ts_api.list_full_version_attachments(db_session, preview.id)
    assert len(rows) == 1
    assert rows[0]["node_id"] == full.id
    assert rows[0]["title"] == "full.pdf"

    await lib_ts_api.replace_full_version_attachments(db_session, preview.id, [])
    await db_session.commit()
    assert await lib_ts_api.list_full_version_attachments(db_session, preview.id) == []
