import logging
import uuid
from typing import Annotated

from sqlalchemy.exc import NoResultFound
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, HTTPException, Security, Depends, status, Request, Query

from papermerge.core import schema, dbapi, orm
from papermerge.core.features.auth import get_current_user
from papermerge.core.features.auth import scopes
from papermerge.core.routers.common import OPEN_API_GENERIC_JSON_DETAIL
from papermerge.core.db import common as dbapi_common
from papermerge.core import exceptions as exc
from papermerge.core.db.engine import get_db
from papermerge.core.features.document.response import DocumentFileResponse
from papermerge.core.features.library_ts.db import api as lib_ts_api
from papermerge.core.pathlib import abs_docver_path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/document-versions", tags=["document-versions"])


@router.api_route(
    "/{document_version_id}/download",
    methods=["GET", "HEAD"],
    response_class=DocumentFileResponse,
    status_code=200,
    responses={
        200: {
            "description": "Binary file download",
            "content": {
                "application/octet-stream": {},
                "application/pdf": {},
                "image/png": {},
                "image/jpeg": {},
                "image/tiff": {}
            }
        },
        404: {
            "description": "Document version not found"
        }
    }
)
async def download_document_version(
    document_version_id: uuid.UUID,
    request: Request,
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.DOCUMENT_DOWNLOAD])
    ],
    db_session: AsyncSession = Depends(get_db),
    inline: bool = Query(False),
):
    """Downloads given document version

    """
    try:
        doc_id, file_name = await dbapi.get_doc_ver_download_meta(
            db_session, document_version_id=document_version_id
        )
        await dbapi_common.require_node_perm(
            db_session,
            node_id=doc_id,
            codename=scopes.NODE_VIEW,
            user_id=user.id,
        )

        await lib_ts_api.increment_download(db_session, doc_id)
        await lib_ts_api.add_audit(
            db_session,
            user_id=user.id,
            action="document_download",
            resource_type="document",
            resource_id=doc_id,
        )
        await db_session.commit()

    except NoResultFound:
        error = schema.Error(messages=["Document version not found"])
        raise HTTPException(status_code=404, detail=error.model_dump())

    file_path = abs_docver_path(document_version_id, file_name)
    if not file_path.exists():
        error = schema.Error(messages=["Document version file not found"])
        raise HTTPException(status_code=404, detail=error.model_dump())

    logger.info(
        "download_document_version_ready correlation_id=%s doc_ver_id=%s",
        getattr(request.state, "correlation_id", None),
        document_version_id,
    )
    return DocumentFileResponse(
        file_path,
        filename=file_name,
        content_disposition_type="inline" if inline else "attachment",
    )

@router.get(
    "/{doc_ver_id}/download-url",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"No `{scopes.DOCUMENT_DOWNLOAD}` permission on the node",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def get_doc_ver_download_url(
    doc_ver_id: uuid.UUID,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.DOCUMENT_DOWNLOAD])],
    db_session: AsyncSession = Depends(get_db),
) -> schema.DownloadURL:
    """
    Returns URL for downloading given document version

    """
    try:
        doc_id = await dbapi.get_doc_id_from_doc_ver_id(
            db_session, doc_ver_id=doc_ver_id
        )
        await dbapi_common.require_node_perm(
            db_session,
            node_id=doc_id,
            codename=scopes.NODE_VIEW,
            user_id=user.id,
        )

        result = await dbapi.get_doc_version_download_url(
            db_session,
            doc_ver_id=doc_ver_id,
        )
    except NoResultFound:
        raise exc.HTTP404NotFound()

    return result



@router.get(
    "/{document_version_id}",
    response_model=schema.DocumentVersion
)
async def document_version_details(
    document_version_id: uuid.UUID,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    db_session=Depends(get_db),
):
    """Get document version details

    """
    try:
        doc_id = await dbapi.get_doc_id_from_doc_ver_id(
            db_session, doc_ver_id=document_version_id
        )
        await dbapi_common.require_node_perm(
            db_session,
            node_id=doc_id,
            codename=scopes.NODE_VIEW,
            user_id=user.id,
        )
        doc_ver: orm.DocumentVersion = await dbapi.get_doc_ver(
            db_session, document_version_id=document_version_id
        )
    except NoResultFound:
        error = schema.Error(messages=["Page not found"])
        raise HTTPException(status_code=404, detail=error.model_dump())

    return schema.DocumentVersion.model_validate(doc_ver)
