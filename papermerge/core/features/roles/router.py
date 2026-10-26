import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Security
from sqlalchemy.exc import NoResultFound
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import schema
from papermerge.core.features.auth import get_current_user
from papermerge.core.features.auth import scopes
from papermerge.core.features.roles.db import api as dbapi
from papermerge.core.routers.common import OPEN_API_GENERIC_JSON_DETAIL
from papermerge.core.routers.params import CommonQueryParams
from papermerge.core.db.engine import get_db
from papermerge.core.schemas.error import ErrorResponse
from papermerge.core.features.library_ts.db import api as lib_ts_api

router = APIRouter(
    prefix="/roles",
    tags=["roles"],
)

logger = logging.getLogger(__name__)


@router.get("/all")
async def get_roles_without_pagination(
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.ROLE_SELECT])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> list[schema.Role]:
    """Get all roles without pagination/filtering/sorting

    """
    result = await dbapi.get_roles_without_pagination(db_session)

    return result


@router.get("/")
async def get_roles(
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.ROLE_VIEW])],
    params: CommonQueryParams = Depends(),
    db_session: AsyncSession = Depends(get_db),
):
    """Get all (paginated) roles

    """
    result = await dbapi.get_roles(
        db_session, page_size=params.page_size, page_number=params.page_number
    )

    return result


@router.get("/{role_id}", response_model=schema.RoleDetails)
async def get_role(
    role_id: uuid.UUID,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.ROLE_VIEW])],
    db_session: AsyncSession = Depends(get_db),
):
    """Get role details

    """
    try:
        result = await dbapi.get_role(db_session, role_id=role_id)
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Role not found")

    return result


@router.post(
    "/", status_code=201,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid permission scopes"},
        409: {"model": ErrorResponse, "description": "Role already exists"},
        422: {"model": ErrorResponse, "description": "Role name is empty"},
        500: {"model": ErrorResponse, "description": "System configuration error or server error"}
    }
)
async def create_role(
    pyrole: schema.CreateRole,
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.ROLE_CREATE])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> schema.Role:
    """Creates role


    **Error Cases:**
    - **400**: Invalid permission scopes provided
    - **409**: Role with the same name already exists
    - **422**: Role name is empty or contains only whitespace
    - **500**: System configuration error or unexpected server error
    """
    role, error = await dbapi.create_role(
        db_session,
        name=pyrole.name,
        scopes=pyrole.scopes,
    )
    if error:
        if "already exists" in error.lower():
            raise HTTPException(
                status_code=409,  # Conflict
                detail=f"Role '{pyrole.name}' already exists"
            )
        elif "unknown permission" in error.lower():
            raise HTTPException(
                status_code=400,  # Bad Request
                detail=error
            )
        elif "no permissions in the system" in error.lower():
            raise HTTPException(
                status_code=500,  # Internal Server Error
                detail="System configuration error: No permissions available"
            )
        elif "cannot be empty" in error.lower() or "name_not_empty" in error.lower():
            raise HTTPException(
                status_code=422,  # Unprocessable Entity
                detail="Role name cannot be empty"
            )
        else:
            # Generic server error for unexpected cases
            raise HTTPException(
                status_code=500,
                detail="Failed to create role"
            )
    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="role_create",
        resource_type="role",
        resource_id=role.id,
        detail=role.name,
    )
    await db_session.commit()
    return role


@router.delete(
    "/{role_id}",
    status_code=204,
    responses={
        404: {
            "description": """No role with specified ID found""",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def delete_role(
    role_id: uuid.UUID,
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.ROLE_DELETE])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> None:
    """Deletes role

    """
    try:
        await dbapi.delete_role(db_session, role_id)
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Role not found")

    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="role_delete",
        resource_type="role",
        resource_id=role_id,
    )
    await db_session.commit()


@router.patch("/{role_id}", status_code=200, response_model=schema.Role)
async def update_role(
    role_id: uuid.UUID,
    attrs: schema.UpdateRole,
    cur_user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.ROLE_UPDATE])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> schema.RoleDetails:
    """Updates role

    """
    try:
        role, error = await dbapi.update_role(
            db_session, role_id=role_id, attrs=attrs
        )
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Role not found")

    if error:
        if "unknown permission" in error.lower():
            raise HTTPException(status_code=400, detail=error)
        raise HTTPException(status_code=500, detail="Failed to update role")

    await lib_ts_api.add_audit(
        db_session,
        user_id=cur_user.id,
        action="role_update",
        resource_type="role",
        resource_id=role_id,
    )
    await db_session.commit()

    return role
