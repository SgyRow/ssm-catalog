"""``document.upload.version`` gates replacing an existing document file."""

import os
from pathlib import Path

from httpx import ASGITransport, AsyncClient

from papermerge.core import dbapi
from papermerge.core.db.engine import get_db
from papermerge.core.features.auth.scopes import Scopes
from papermerge.core.features.conftest import access_token_for_user, get_app_with_routes
from papermerge.core.features.document.db import api as doc_dbapi
from papermerge.core.features.roles import test_role_presets
from papermerge.core.tests.resource_file import ResourceFile

DIR_ABS_PATH = os.path.abspath(os.path.dirname(__file__))
RESOURCES = Path(DIR_ABS_PATH) / "resources"


async def test_employee_preset_excludes_upload_version():
    assert Scopes.DOCUMENT_UPLOAD_VERSION not in test_role_presets.employee_scopes()
    assert Scopes.DOCUMENT_UPLOAD_VERSION in test_role_presets.full_access_scopes()


async def test_document_has_uploaded_content(
    db_session, make_document, make_document_from_resource, user
):
    empty = await make_document(
        title="empty.pdf", user=user, parent=user.home_folder
    )
    assert await doc_dbapi.document_has_uploaded_content(db_session, empty.id) is False

    filled = await make_document_from_resource(
        resource=ResourceFile.THREE_PAGES, user=user, parent=user.home_folder
    )
    assert await doc_dbapi.document_has_uploaded_content(db_session, filled.id) is True


async def test_upload_new_version_requires_upload_version_scope(
    make_user, make_document_from_resource, make_role, db_session
):
    """User with ``document.upload`` but without ``document.upload.version``
    cannot replace an existing file."""
    await dbapi.sync_perms(db_session)
    user = await make_user("uploader", is_superuser=False)
    role = await make_role(
        "uploader_role",
        scopes=[
            Scopes.NODE_VIEW,
            Scopes.NODE_CREATE,
            Scopes.DOCUMENT_UPLOAD,
            Scopes.USER_ME,
        ],
    )
    user.roles.append(role)
    await db_session.commit()

    doc = await make_document_from_resource(
        resource=ResourceFile.THREE_PAGES, user=user, parent=user.home_folder
    )

    app = get_app_with_routes()

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    # Token scopes stay minimal; effective rights come from the DB role.
    token = access_token_for_user(user, scopes=[Scopes.USER_ME])
    transport = ASGITransport(app=app)

    pdf_path = RESOURCES / "three-pages.pdf"
    with open(pdf_path, "rb") as file:
        file_content = file.read()

    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"Authorization": f"Bearer {token}"},
    ) as client:
        response = await client.post(
            f"/documents/{doc.id}/upload",
            files={"file": ("replace.pdf", file_content, "application/pdf")},
        )

    app.dependency_overrides.clear()
    assert response.status_code == 403, response.json()
