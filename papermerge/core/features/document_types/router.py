import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Security, status
from sqlalchemy.exc import NoResultFound
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import schema, dbapi
from papermerge.core.features.auth import get_current_user
from papermerge.core.features.auth import scopes
from papermerge.core.routers.common import OPEN_API_GENERIC_JSON_DETAIL
from papermerge.core.features.users import schema as users_schema
from papermerge.core.features.document_types import schema as dt_schema
from papermerge.core.db.engine import get_db
from .types import PaginatedQueryParams
from papermerge.core.features.library_ts.db import api as lib_ts_api

router = APIRouter(
    prefix="/document-types",
    tags=["document-types"],
)

logger = logging.getLogger(__name__)


@router.get(
    "/all",
    response_model=list[schema.DocumentType],
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": """User does not belong to group""",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def get_document_types_without_pagination(
    user: Annotated[
        users_schema.User,
        Security(get_current_user, scopes=[scopes.DOCUMENT_TYPE_VIEW]),
    ],
    group_id: uuid.UUID | None = None,
    db_session: AsyncSession = Depends(get_db),
):
    """Get all document types without pagination

    if non-empty `group_id` parameter is supplied it will
    return all document types belonging to this group if and only
    if current user belongs to this group.
    if non-empty `group_id` parameter is provided and current
    user does not belong to this group - http status code 403 (Forbidden) will
    be raised.
    If `group_id` parameter is not provided (empty) then
    will return all document types of the current user.

    """
    result = await dbapi.get_document_types_without_pagination(
        db_session, user_id=user.id, group_id=group_id
    )

    return result


@router.get(
    "/all-grouped",
    response_model=list[dt_schema.GroupedDocumentType],
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": """User does not belong to group""",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def get_document_types_without_pagination(
    user: Annotated[
        users_schema.User,
        Security(get_current_user, scopes=[scopes.DOCUMENT_TYPE_VIEW]),
    ],
    db_session: AsyncSession = Depends(get_db),
):
    """Returns all document types to which user has access to, grouped
    by owner. Results are not paginated.

    """
    result = await dbapi.get_document_types_grouped_by_owner_without_pagination(
        db_session, user_id=user.id
    )

    return result


@router.get("/")
async def get_document_types(
    user: Annotated[
        users_schema.User, Security(get_current_user, scopes=[scopes.CUSTOM_FIELD_VIEW])
    ],
    params: PaginatedQueryParams = Depends(),
    db_session: AsyncSession = Depends(get_db),
) -> schema.PaginatedResponse[schema.DocumentType]:
    """Get all (paginated) document types

    """
    paginated_response = await dbapi.get_document_types(
        db_session,
        user_id=user.id,
        page_size=params.page_size,
        page_number=params.page_number,
        order_by=params.order_by,
        filter=params.filter,
    )

    return paginated_response


@router.get("/{document_type_id}", response_model=schema.DocumentType)
async def get_document_type(
    document_type_id: uuid.UUID,
    user: Annotated[
        users_schema.User,
        Security(get_current_user, scopes=[scopes.DOCUMENT_TYPE_VIEW]),
    ],
    db_session: AsyncSession = Depends(get_db),
):
    """Get document type

    """
    try:
        result = await dbapi.get_document_type(db_session, document_type_id=document_type_id)
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Document type not found")
    return result


@router.post("/", status_code=201)
async def create_document_type(
    dtype: schema.CreateDocumentType,
    user: Annotated[
        users_schema.User,
        Security(get_current_user, scopes=[scopes.DOCUMENT_TYPE_CREATE]),
    ],
    db_session: AsyncSession = Depends(get_db),
) -> schema.DocumentType:
    """Creates document type

    If attribute `group_id` is present, document type will be owned
    by respective group, otherwise ownership is set to current user.

    """
    kwargs = {
        "name": dtype.name,
        "path_template": dtype.path_template,
        "custom_field_ids": dtype.custom_field_ids,
    }
    if dtype.group_id:
        kwargs["group_id"] = dtype.group_id
    else:
        kwargs["user_id"] = user.id

    try:
        document_type = await dbapi.create_document_type(db_session, **kwargs)
    except Exception as e:
        error_msg = str(e)
        if "UNIQUE constraint failed" in error_msg:
            raise HTTPException(status_code=400, detail="Document type already exists")
        raise HTTPException(status_code=400, detail=error_msg)

    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="document_type_create",
        resource_type="document_type",
        resource_id=document_type.id,
        detail=document_type.name,
    )
    await db_session.commit()

    return document_type


@router.delete(
    "/{document_type_id}",
    status_code=204,
    responses={
        404: {
            "description": """No document type with specified ID found""",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def delete_document_type(
    document_type_id: uuid.UUID,
    user: Annotated[
        users_schema.User,
        Security(get_current_user, scopes=[scopes.DOCUMENT_TYPE_DELETE]),
    ],
    db_session: AsyncSession = Depends(get_db),
) -> None:
    """Deletes document type

    """
    try:
        await dbapi.delete_document_type(db_session, document_type_id)
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Document type not found")

    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="document_type_delete",
        resource_type="document_type",
        resource_id=document_type_id,
    )
    await db_session.commit()


@router.patch(
    "/{document_type_id}",
    status_code=200,
    response_model=schema.DocumentType,
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": """User does not belong to group""",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def update_document_type(
    document_type_id: uuid.UUID,
    attrs: schema.UpdateDocumentType,
    cur_user: Annotated[
        users_schema.User,
        Security(get_current_user, scopes=[scopes.DOCUMENT_TYPE_UPDATE]),
    ],
    db_session: AsyncSession = Depends(get_db),
) -> schema.DocumentType:
    """Updates document type

    """
    try:
        if attrs.group_id:
            group_id = attrs.group_id
            ok = await dbapi.user_belongs_to(
                db_session, user_id=cur_user.id, group_id=group_id
            )
            if not ok:
                user_id = cur_user.id
                detail = f"User {user_id=} does not belong to group {group_id=}"
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, detail=detail
                )
        else:
            attrs.user_id = cur_user.id

        dtype: schema.DocumentType = await dbapi.update_document_type(
            db_session,
            document_type_id=document_type_id,
            attrs=attrs,
        )
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Document type not found")

    await lib_ts_api.add_audit(
        db_session,
        user_id=cur_user.id,
        action="document_type_update",
        resource_type="document_type",
        resource_id=document_type_id,
    )
    await db_session.commit()

    return dtype
