import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Security
from sqlalchemy.exc import NoResultFound
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import schema
from papermerge.core.features.auth import get_current_user
from papermerge.core.features.auth import scopes
from papermerge.core.features.groups.db import api as dbapi
from papermerge.core.routers.common import OPEN_API_GENERIC_JSON_DETAIL
from papermerge.core.routers.params import CommonQueryParams
from papermerge.core.db.engine import get_db
from papermerge.core.features.library_ts.db import api as lib_ts_api

router = APIRouter(
    prefix="/groups",
    tags=["groups"],
)

logger = logging.getLogger(__name__)


@router.get("/all")
async def get_groups_without_pagination(
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.GROUP_SELECT])
    ],
    db_session: AsyncSession=Depends(get_db),
) -> list[schema.Group]:
    """Get all groups without pagination/filtering/sorting

    """
    result = await dbapi.get_groups_without_pagination(db_session)

    return result


@router.get("/")
async def get_groups(
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.GROUP_VIEW])
    ],
    params: CommonQueryParams = Depends(),
    db_session: AsyncSession=Depends(get_db),
):
    """Get all (paginated) groups

    """
    result = await dbapi.get_groups(
        db_session, page_size=params.page_size, page_number=params.page_number
    )

    return result


@router.get("/{group_id}", response_model=schema.GroupDetails)
async def get_group(
    group_id: uuid.UUID,
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.GROUP_VIEW])
    ],
    db_session: AsyncSession = Depends(get_db),
):
    """Get group details

    """
    try:
        result = await dbapi.get_group(db_session, group_id=group_id)
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Group not found")

    return result


@router.post("/", status_code=201)
async def create_group(
    pygroup: schema.CreateGroup,
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.GROUP_CREATE])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> schema.Group:
    """Creates group

    """
    try:
        group = await dbapi.create_group(
            db_session,
            name=pygroup.name,
            with_special_folders=pygroup.with_special_folders
        )
    except Exception as e:
        error_msg = str(e)
        if "UNIQUE constraint failed" in error_msg:
            raise HTTPException(status_code=400, detail="Group already exists")
        raise HTTPException(status_code=400, detail=error_msg)

    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="group_create",
        resource_type="group",
        resource_id=group.id,
        detail=group.name,
    )
    await db_session.commit()

    return group


@router.delete(
    "/{group_id}",
    status_code=204,
    responses={
        404: {
            "description": """No group with specified ID found""",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def delete_group(
    group_id: uuid.UUID,
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.GROUP_DELETE])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> None:
    """Deletes group

    """
    try:
        await dbapi.delete_group(db_session, group_id)
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Group not found")

    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="group_delete",
        resource_type="group",
        resource_id=group_id,
    )
    await db_session.commit()


@router.patch("/{group_id}", status_code=200, response_model=schema.Group)
async def update_group(
    group_id: uuid.UUID,
    attrs: schema.UpdateGroup,
    cur_user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.GROUP_UPDATE])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> schema.Group:
    """Updates group

    `with_special_folders` flag expresses user intention regarding special folders:
    does he/she want to keep, or create, special folders of this group
    or he/she intends to remove them. Special folders clean up is performed
    as background task.

    `with_special_folders` flag behaviour is as follows:

    There two cases:

    Case 1: group does NOT have special folders (home and inbox).
        In such case, if `with_special_folders` is True, then special folders for this group
        will be created.
        If `with_special_folders` is False, then nothing with happen in
        respect to special folders.

    Case 2: group does have special folders.
        In such case, if `with_special_folders` is True, then nothing
        will happen in respect to special folders.
        If `with_special_folders` is False, then database field
        `group.delete_special_folders` will be set to True to indicate
         to user that deletion of special folder is desired. Background task
        will be scheduled to delete special folders. Note that
        it is background task to set `home_folder_id` and `inbox_folder_id` to
        NULL. In other words, it may take a while until group's special folders
        are cleanup and set to NULL.

    """
    try:
        group: schema.Group = await dbapi.update_group(
            db_session, group_id=group_id, attrs=attrs
        )
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Group not found")

    await lib_ts_api.add_audit(
        db_session,
        user_id=cur_user.id,
        action="group_update",
        resource_type="group",
        resource_id=group_id,
    )
    await db_session.commit()

    return group
