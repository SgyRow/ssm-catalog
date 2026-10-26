import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Security
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import schema, dbapi
from papermerge.core.features import auth
from papermerge.core.features.auth import scopes
from papermerge.core.routers.common import OPEN_API_GENERIC_JSON_DETAIL
from papermerge.core.routers.params import CommonQueryParams
from papermerge.core.db.engine import get_db
from papermerge.core.features.library_ts.db import api as lib_ts_api

router = APIRouter(
    prefix="/users",
    tags=["users"],
)

logger = logging.getLogger(__name__)


@router.get("/group-homes")
async def get_user_group_homes(
    user: Annotated[
        schema.User, Security(auth.get_current_user, scopes=[scopes.NODE_VIEW])
    ],
    db_session: AsyncSession=Depends(get_db),
) -> list[schema.UserHome]:
    """Get all user group homes

    """
    result, error = await dbapi.get_user_group_homes(db_session, user_id=user.id)

    if error:
        raise HTTPException(status_code=400, detail=error)

    return result


@router.get("/group-inboxes")
async def get_user_group_inboxes(
    user: Annotated[
        schema.User, Security(auth.get_current_user, scopes=[scopes.NODE_VIEW])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> list[schema.UserInbox]:
    """Get all user group inboxes

    """
    result, error = await dbapi.get_user_group_inboxes(db_session, user_id=user.id)

    if error:
        raise HTTPException(status_code=400, detail=error)

    return result


@router.get("/me", response_model=schema.UserDetails)
async def get_current_user(
    user: Annotated[schema.User, Depends(auth.get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> schema.UserDetails:
    """Returns current authenticated user."""
    logger.debug(f"User {user} found")
    user_details, error = await dbapi.get_user_details(
        db_session, user_id=user.id
    )
    if error:
        raise HTTPException(status_code=404, detail=error.model_dump())
    # Keep auth-computed scopes (JWT, groups, superuser, baseline).
    user_details.scopes = user.scopes
    return user_details


@router.patch("/me", status_code=200, response_model=schema.UserDetails)
async def update_current_user_profile(
    attrs: schema.UpdateUserProfile,
    user: Annotated[schema.User, Depends(auth.get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> schema.UserDetails:
    """Update current user's own profile (email, first name, last name).

    Available to any authenticated user without ``user.update`` scope.
    """
    user_details, error = await dbapi.update_user(
        db_session,
        user_id=user.id,
        attrs=schema.UpdateUser(
            email=attrs.email,
            first_name=attrs.first_name,
            last_name=attrs.last_name,
        ),
    )
    if error:
        raise HTTPException(status_code=400, detail=error.model_dump())

    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="user_profile_update",
        resource_type="user",
        resource_id=user.id,
    )
    await db_session.commit()

    user_details.scopes = user.scopes
    return user_details


@router.post("/me/change-password", status_code=200, response_model=schema.UserDetails)
async def change_current_user_password(
    attrs: schema.ChangeOwnPassword,
    user: Annotated[schema.User, Depends(auth.get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> schema.UserDetails:
    """Change current user's own password (requires current password).

    Available to any authenticated user without ``user.update`` scope.
    """
    _, error = await dbapi.change_own_password(
        db_session,
        user_id=user.id,
        current_password=attrs.current_password,
        password=attrs.password,
    )
    if error:
        raise HTTPException(status_code=400, detail=error.model_dump())

    user_details, error = await dbapi.get_user_details(
        db_session, user_id=user.id
    )
    if error:
        raise HTTPException(status_code=404, detail=error.model_dump())

    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="user_password_change",
        resource_type="user",
        resource_id=user.id,
    )
    await db_session.commit()

    user_details.scopes = user.scopes
    return user_details


@router.get("/")
async def get_users(
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.USER_VIEW])],
    params: CommonQueryParams = Depends(),
    db_session: AsyncSession=Depends(get_db),
) -> schema.PaginatedResponse[schema.User]:
    """Get all users

    """

    paginated_users = await dbapi.get_users(
        db_session, page_size=params.page_size, page_number=params.page_number
    )

    return paginated_users


@router.get("/all", response_model=list[schema.User])
async def get_users_without_pagination(
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.USER_SELECT])
    ],
    db_session: AsyncSession=Depends(get_db),
):
    """Get all users without pagination/filtering/sorting

    """
    result = await dbapi.get_users_without_pagination(db_session)

    return result


@router.post("/", status_code=201)
async def create_user(
    pyuser: schema.CreateUser,
    cur_user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.USER_CREATE])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> schema.User:
    """Creates user

    """
    user, error = await dbapi.create_user(
        db_session,
        username=pyuser.username,
        email=pyuser.email,
        password=pyuser.password,
        role_ids=pyuser.role_ids,
        is_active=pyuser.is_active,
        is_superuser=pyuser.is_superuser,
        group_ids=pyuser.group_ids,
        first_name=pyuser.first_name,
        last_name=pyuser.last_name,
    )

    if error:
        raise HTTPException(status_code=400, detail=error.model_dump())

    await lib_ts_api.add_audit(
        db_session,
        user_id=cur_user.id,
        action="user_create",
        resource_type="user",
        resource_id=user.id,
        detail=user.username,
    )
    await db_session.commit()

    return user


@router.get(
    "/{user_id}",
    status_code=200,
    responses={
        404: {
            "description": """No user with specified UUID found""",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
    response_model=schema.UserDetails,
)
async def get_user_details(
    user_id: UUID,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.USER_VIEW])],
    db_session: AsyncSession  =Depends(get_db),
):
    """Get user details

    """
    user, error = await dbapi.get_user_details(
        db_session,
        user_id=user_id,
    )

    if error:
        raise HTTPException(status_code=404, detail=error.model_dump())

    return user


@router.delete(
    "/{user_id}",
    status_code=204,
    responses={
        409: {
            "description": """Deletion is not possible because there is only
             one user left""",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        },
        404: {
            "description": """No user with specified UUID found""",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        },
    },
)
async def delete_user(
    user_id: UUID,
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.USER_DELETE])
    ],
    db_session: AsyncSession=Depends(get_db),
) -> None:
    """Deletes user

    """
    if await dbapi.get_users_count(db_session) == 1:
        raise HTTPException(
            status_code=409, detail="Deletion not possible. Only one user left."
        )

    try:
        await dbapi.delete_user(db_session, user_id=user_id)
    except Exception:
        logger.exception("Failed to delete user %s", user_id)
        raise HTTPException(
            status_code=500,
            detail="Could not delete user at this time.",
        )

    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="user_delete",
        resource_type="user",
        resource_id=user_id,
    )
    await db_session.commit()


@router.patch("/{user_id}", status_code=200, response_model=schema.UserDetails)
async def update_user(
    user_id: UUID,
    attrs: schema.UpdateUser,
    cur_user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.USER_UPDATE])
    ],
    db_session: AsyncSession=Depends(get_db),
) -> schema.UserDetails:
    """Updates user

    """
    user, error = await dbapi.update_user(db_session, user_id=user_id, attrs=attrs)

    if error:
        raise HTTPException(status_code=404, detail=error.model_dump())

    await lib_ts_api.add_audit(
        db_session,
        user_id=cur_user.id,
        action="user_update",
        resource_type="user",
        resource_id=user_id,
    )
    await db_session.commit()

    return user


@router.post(
    "/{user_id}/change-password", status_code=200, response_model=schema.UserDetails
)
async def change_user_password(
    user_id: UUID,
    attrs: schema.ChangeUserPassword,
    cur_user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.USER_UPDATE])
    ],
    db_session: AsyncSession=Depends(get_db),
) -> schema.UserDetails:
    """Change user password

    """
    user, error = await dbapi.change_password(
        db_session, user_id=UUID(attrs.userId), password=attrs.password
    )

    if error:
        logger.error(
            "Password change failed for user %s: %s",
            user_id,
            error.model_dump(),
        )
        raise HTTPException(
            status_code=500,
            detail={"messages": ["Could not update password."]},
        )

    await lib_ts_api.add_audit(
        db_session,
        user_id=cur_user.id,
        action="user_password_change",
        resource_type="user",
        resource_id=user_id,
    )
    await db_session.commit()

    return user
