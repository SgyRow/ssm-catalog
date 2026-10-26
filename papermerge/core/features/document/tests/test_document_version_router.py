import os
import uuid
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import dbapi, schema
from papermerge.core.features.auth.scopes import NODE_VIEW
from papermerge.core.tests.resource_file import ResourceFile

DIR_ABS_PATH = os.path.abspath(os.path.dirname(__file__))
RESOURCES = Path(DIR_ABS_PATH) / "resources"


async def test_download_document_version(
    auth_api_client, make_document_from_resource, user, db_session: AsyncSession
):
    doc = await make_document_from_resource(
        resource=ResourceFile.THREE_PAGES, user=user, parent=user.home_folder
    )

    last_ver = await dbapi.get_last_doc_ver(db_session, doc_id=doc.id)

    response = await auth_api_client.get(f"/document-versions/{last_ver.id}/download")
    assert response.status_code == 200


async def test_document_version_download_request_non_existing_resource(auth_api_client):
    non_existing_resource_id = uuid.uuid4().hex
    response = await auth_api_client.get(
        f"/document-versions/{non_existing_resource_id}/download"
    )
    assert response.status_code == 403


async def test_document_version_details_request_non_existing_resource(auth_api_client):
    non_existing_resource_id = uuid.uuid4().hex
    response = await auth_api_client.get(f"/document-versions/{non_existing_resource_id}")
    assert response.status_code == 403


async def test_get_doc_ver_download_url(
    auth_api_client, make_document_from_resource, user, db_session: AsyncSession
):
    doc = await make_document_from_resource(
        resource=ResourceFile.THREE_PAGES, user=user, parent=user.home_folder
    )

    last_ver = await dbapi.get_last_doc_ver(db_session, doc_id=doc.id)

    response = await auth_api_client.get(f"/document-versions/{last_ver.id}/download-url")

    assert response.status_code == 200
    data = schema.DownloadURL(**response.json())
    assert str(last_ver.id) in data.downloadURL


async def test_download_document_version_for_shared_reader_role(
    auth_api_client, make_document_from_resource, make_user, db_session: AsyncSession
):
    """Recipient with shared NODE_VIEW role can fetch doc version file."""
    await dbapi.sync_perms(db_session)
    owner = await make_user("owner", is_superuser=False)
    recipient = auth_api_client.user
    role, err = await dbapi.create_role(
        db_session, "Shared View Role", scopes=[NODE_VIEW]
    )
    assert role, err

    doc = await make_document_from_resource(
        resource=ResourceFile.THREE_PAGES,
        user=owner,
        parent=owner.home_folder,
    )
    last_ver = await dbapi.get_last_doc_ver(db_session, doc_id=doc.id)
    await dbapi.create_shared_nodes(
        db_session,
        node_ids=[doc.id],
        role_ids=[role.id],
        owner_id=owner.id,
        user_ids=[recipient.id],
    )

    response = await auth_api_client.get(f"/document-versions/{last_ver.id}/download")
    assert response.status_code == 200
