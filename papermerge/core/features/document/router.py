import asyncio
import io
import logging
import uuid
from typing import Annotated

from fastapi import (
    APIRouter,
    HTTPException,
    Security,
    UploadFile,
    Request,
    status,
    Query,
    Depends,
)
from sqlalchemy.exc import NoResultFound
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import exceptions as exc
from papermerge.core import constants as const
from papermerge.core import dbapi, schema
from papermerge.core.features.auth import get_current_user, scopes
from papermerge.core.features.document.schema import DocumentTypeArg
from papermerge.core.config import get_settings, FileServer
from papermerge.core.tasks import send_task
from papermerge.core.db import common as dbapi_common
from papermerge.core.routers.common import OPEN_API_GENERIC_JSON_DETAIL
from papermerge.core.db.engine import get_db
from papermerge.core.features.library_ts.db import api as lib_ts_api
from papermerge.core.features.portal import policy as portal_policy
from papermerge.core.features.portal.db import api as portal_dbapi

router = APIRouter(
    prefix="/documents",
    tags=["documents"],
)

logger = logging.getLogger(__name__)
config = get_settings()


@router.patch(
    "/{document_id}/custom-fields",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"No `{scopes.NODE_UPDATE}` permission on the node",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def update_document_custom_field_values(
    document_id: uuid.UUID,
    custom_fields_update: list[schema.DocumentCustomFieldsUpdate],
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.NODE_UPDATE])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> list[schema.CFV]:
    """
    Update document's custom fields.
    """
    custom_fields = {}
    for cf in custom_fields_update:
        if cf.value is None and cf.custom_field_value_id is None:
            continue
        custom_fields[cf.key] = cf.value

    await dbapi_common.require_node_perm(
        db_session,
        node_id=document_id,
        codename=scopes.NODE_UPDATE,
        user_id=user.id,
    )
    await portal_policy.require_portal_on_update_node(
        db_session, user, document_id
    )

    try:
        updated_entries = await dbapi.update_doc_cfv(
            db_session,
            document_id=document_id,
            custom_fields=custom_fields,
        )
    except NoResultFound:
        raise exc.HTTP404NotFound()

    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="document_custom_fields_update",
        resource_type="document",
        resource_id=document_id,
        detail=lib_ts_api.audit_detail_json({"keys": list(custom_fields.keys())}),
    )
    await db_session.commit()

    send_task(
        const.PATH_TMPL_MOVE_DOCUMENT,
        kwargs={"document_id": str(document_id)},
        route_name="path_tmpl",
    )

    return updated_entries


@router.get(
    "/{document_id}/custom-fields",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"No `{scopes.NODE_VIEW}` permission on the node",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def get_document_custom_field_values(
    document_id: uuid.UUID,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    db_session: AsyncSession = Depends(get_db),
) -> list[schema.CFV]:
    """
    Get document custom field values.
    """
    await dbapi_common.require_node_perm(
        db_session,
        node_id=document_id,
        codename=scopes.NODE_VIEW,
        user_id=user.id,
    )
    await portal_policy.require_portal_view_if_under_portal(
        db_session, user, document_id
    )

    try:
        doc = await dbapi.get_doc_cfv(
            db_session,
            document_id=document_id,
        )
    except NoResultFound:
        raise exc.HTTP404NotFound()

    return doc


@router.post(
    "/{document_id}/upload",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"No `{scopes.DOCUMENT_UPLOAD}` permission on the node",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def upload_file(
    document_id: uuid.UUID,
    file: UploadFile,
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.DOCUMENT_UPLOAD])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> schema.Document:
    """
    Uploads document's file.


    Document model must be created beforehand via `POST /nodes` endpoint
    provided with `ctype` = `document`.

    In order to upload file cURL:

        $ ls
        booking.pdf

        $ curl <server url>/documents/<uuid>/upload
        --form "file=@booking.pdf;type=application/pdf"
        -H "Authorization: Bearer <your token>"

    Note that `file=` is important and must be exactly that, it is the name
    of the field in `multipart/form-data`. In other words, something like
    '--form "data=@booking.pdf..." won't work.
    The uploaded file is encoded as `multipart/form-data` and is sent
    in POST request body.
    """
    content = await file.read()

    await dbapi_common.require_node_perm(
        db_session,
        node_id=document_id,
        codename=scopes.DOCUMENT_UPLOAD,
        user_id=user.id,
    )
    await portal_policy.require_portal_on_document_file_upload(
        db_session, user, document_id
    )

    doc, error = await dbapi.upload(
        db_session,
        document_id=document_id,
        size=file.size,
        content=io.BytesIO(content),
        file_name=file.filename,
        content_type=file.headers.get("content-type"),
    )

    if error:
        raise HTTPException(status_code=400, detail=error.model_dump())

    root_id = await portal_dbapi.get_portal_root_id(db_session)
    is_portal = bool(
        root_id
        and await portal_dbapi.is_node_under_portal_root(
            db_session, document_id, root_id
        )
    )
    last_ver = doc.versions[-1] if doc.versions else None
    ver_no = last_ver.number if last_ver else None
    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="document_upload",
        resource_type="document",
        resource_id=document_id,
        detail=lib_ts_api.audit_detail_json(
            {"title": doc.title, "version": ver_no, "portal": is_portal}
        ),
    )
    await db_session.commit()

    return doc


@router.patch(
    "/{document_id}/type",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"No `{scopes.NODE_UPDATE}` permission on the node",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def update_document_type(
    document_id: uuid.UUID,
    document_type: DocumentTypeArg,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    db_session: AsyncSession = Depends(get_db),
):
    """
    Updates document type.
    """
    try:
        await dbapi_common.require_node_perm(
            db_session,
            node_id=document_id,
            codename=scopes.NODE_UPDATE,
            user_id=user.id,
        )
        await portal_policy.require_portal_on_update_node(
            db_session, user, document_id
        )

        await dbapi.update_doc_type(
            db_session,
            document_id=document_id,
            document_type_id=document_type.document_type_id,
        )
    except NoResultFound:
        raise exc.HTTP404NotFound()

    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="document_type_update",
        resource_type="document",
        resource_id=document_id,
        detail=lib_ts_api.audit_detail_json(
            {"document_type_id": str(document_type.document_type_id)}
        ),
    )
    await db_session.commit()

    send_task(
        const.PATH_TMPL_MOVE_DOCUMENT,
        kwargs={"document_id": str(document_id)},
        route_name="path_tmpl",
    )


@router.get(
    "/{doc_id}/last-version/",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"No `{scopes.NODE_VIEW}` permission on the node",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def get_document_last_version(
    doc_id: uuid.UUID,
    request: Request,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    db_session: AsyncSession = Depends(get_db),
) -> schema.DocumentVersion:
    """
    Returns document's last version

    """
    started = asyncio.get_running_loop().time()
    try:
        await dbapi_common.require_node_perm(
            db_session,
            node_id=doc_id,
            codename=scopes.NODE_VIEW,
            user_id=user.id,
        )
        await portal_policy.require_portal_view_if_under_portal(
            db_session, user, doc_id
        )

        result = await dbapi.get_last_doc_ver_preview(
            db_session,
            doc_id=doc_id,
        )
    except NoResultFound:
        raise exc.HTTP404NotFound()

    elapsed = (asyncio.get_running_loop().time() - started) * 1000
    logger.info(
        "last_doc_version_ready correlation_id=%s doc_id=%s pages=%s elapsed_ms=%.2f",
        getattr(request.state, "correlation_id", None),
        doc_id,
        len(result.pages or []),
        elapsed,
    )
    return result


@router.get(
    "/{doc_id}/versions",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"No `{scopes.NODE_VIEW}` permission on the node",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def get_doc_versions_list(
    doc_id: uuid.UUID,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    db_session: AsyncSession = Depends(get_db),
) -> list[schema.DocVerListItem]:
    """
    Returns versions list for given document ID

    Returned versions are sorted descending by version number.

    """
    try:
        await dbapi_common.require_node_perm(
            db_session,
            node_id=doc_id,
            codename=scopes.NODE_VIEW,
            user_id=user.id,
        )
        await portal_policy.require_portal_view_if_under_portal(
            db_session, user, doc_id
        )

        result = await dbapi.get_doc_versions_list(
            db_session,
            doc_id=doc_id,
        )
    except NoResultFound:
        raise exc.HTTP404NotFound()

    return result


@router.get(
    "/{document_id}",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"No `{scopes.NODE_VIEW}` permission on the node",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def get_document_details(
    document_id: uuid.UUID,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    db_session: AsyncSession = Depends(get_db),
) -> schema.DocumentWithoutVersions:
    """
    Get document details

    """
    try:
        await dbapi_common.require_node_perm(
            db_session,
            node_id=document_id,
            codename=scopes.NODE_VIEW,
            user_id=user.id,
        )
        await portal_policy.require_portal_view_if_under_portal(
            db_session, user, document_id
        )

        doc = await dbapi.get_doc(db_session, id=document_id)
        await lib_ts_api.increment_view(db_session, document_id)
        await lib_ts_api.record_recent_view(db_session, user.id, document_id)
        await lib_ts_api.add_audit(
            db_session,
            user_id=user.id,
            action="document_view",
            resource_type="document",
            resource_id=document_id,
        )
        await db_session.commit()
    except NoResultFound:
        raise exc.HTTP404NotFound()
    return doc


@router.get(
    "/thumbnail-img-status/",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"No `{scopes.NODE_VIEW}` permission on one of the documents",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def get_document_doc_thumbnail_status(
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    doc_ids: list[uuid.UUID] = Query(),
    db_session: AsyncSession = Depends(get_db),
) -> list[schema.DocumentPreviewImageStatus]:
    """
    Get documents thumbnail image preview status

    Receives as input a list of document IDs (i.e. node IDs).

    In case of CDN setup, for each document with NULL value in `preview_status`
    field - one `S3worker` task will be scheduled for generating respective
    document thumbnail.

    """

    started = asyncio.get_running_loop().time()
    direct_access_ids = await dbapi_common.get_directly_accessible_node_ids(
        db_session,
        node_ids=doc_ids,
        user_id=user.id,
    )
    for doc_id in doc_ids:
        if doc_id in direct_access_ids:
            continue
        await dbapi_common.require_node_perm(
            db_session,
            node_id=doc_id,
            codename=scopes.NODE_VIEW,
            user_id=user.id,
        )

    response, doc_ids_not_yet_considered = await dbapi.get_docs_thumbnail_img_status(
        db_session, doc_ids=doc_ids
    )

    fserver = config.papermerge__main__file_server
    if fserver == FileServer.S3:
        if len(doc_ids_not_yet_considered) > 0:
            for doc_id in doc_ids_not_yet_considered:
                queued = send_task(
                    const.S3_WORKER_GENERATE_DOC_THUMBNAIL,
                    kwargs={"doc_id": str(doc_id)},
                    route_name="s3preview",
                )
                logger.info(
                    "thumbnail_status_enqueue doc_id=%s queued=%s",
                    doc_id,
                    queued,
                )

    elapsed = (asyncio.get_running_loop().time() - started) * 1000
    logger.info(
        "thumbnail_status_completed doc_count=%s missing_count=%s elapsed_ms=%.2f",
        len(doc_ids),
        len(doc_ids_not_yet_considered),
        elapsed,
    )

    return response
