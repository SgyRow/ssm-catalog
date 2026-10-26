from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, Security, status
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import schema
from papermerge.core.db import common as dbapi_common
from papermerge.core.db.engine import get_db
from papermerge.core.exceptions import HTTP404NotFound
from papermerge.core.features.auth import get_current_user, scopes
from papermerge.core.features.citizen_categories import schema as cc_schema
from papermerge.core.features.citizen_categories.db import api as cc_dbapi
from papermerge.core.features.library_ts.db import api as lib_ts_api

router = APIRouter(prefix="/citizen-categories", tags=["citizen-categories"])


@router.get("", response_model=list[cc_schema.CitizenCategoryOut])
async def list_citizen_categories(
    user: Annotated[
        schema.User,
        Security(get_current_user, scopes=[scopes.CITIZEN_CATEGORY_VIEW]),
    ],
    db_session: AsyncSession = Depends(get_db),
) -> list[cc_schema.CitizenCategoryOut]:
    _ = user
    items = await cc_dbapi.list_categories(db_session)
    await db_session.commit()
    return items


@router.post(
    "",
    response_model=cc_schema.CitizenCategoryOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_citizen_category(
    payload: cc_schema.CitizenCategoryCreateIn,
    user: Annotated[
        schema.User,
        Security(get_current_user, scopes=[scopes.CITIZEN_CATEGORY_CREATE]),
    ],
    db_session: AsyncSession = Depends(get_db),
) -> cc_schema.CitizenCategoryOut:
    row, error = await cc_dbapi.create_category(db_session, payload)
    if error:
        raise HTTPException(status_code=400, detail=error)
    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="citizen_category_create",
        resource_type="citizen_category",
        resource_id=row.id,
        detail=row.name[:2000],
    )
    await db_session.commit()
    return row


@router.patch("/{category_id}", response_model=cc_schema.CitizenCategoryOut)
async def update_citizen_category(
    category_id: UUID,
    payload: cc_schema.CitizenCategoryUpdateIn,
    user: Annotated[
        schema.User,
        Security(get_current_user, scopes=[scopes.CITIZEN_CATEGORY_UPDATE]),
    ],
    db_session: AsyncSession = Depends(get_db),
) -> cc_schema.CitizenCategoryOut:
    row, error = await cc_dbapi.update_category(db_session, category_id, payload)
    if error == "not_found":
        raise HTTP404NotFound()
    if error:
        raise HTTPException(status_code=400, detail=error)
    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="citizen_category_update",
        resource_type="citizen_category",
        resource_id=category_id,
    )
    await db_session.commit()
    return row


@router.delete("/{category_id}", status_code=204, response_class=Response)
async def delete_citizen_category(
    category_id: UUID,
    user: Annotated[
        schema.User,
        Security(get_current_user, scopes=[scopes.CITIZEN_CATEGORY_DELETE]),
    ],
    db_session: AsyncSession = Depends(get_db),
) -> Response:
    ok = await cc_dbapi.delete_category(db_session, category_id)
    if not ok:
        raise HTTP404NotFound()
    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="citizen_category_delete",
        resource_type="citizen_category",
        resource_id=category_id,
    )
    await db_session.commit()
    return Response(status_code=204)


@router.get(
    "/{category_id}/folders",
    response_model=list[cc_schema.CitizenCategoryFolderOut],
)
async def list_citizen_category_folders(
    category_id: UUID,
    user: Annotated[
        schema.User,
        Security(get_current_user, scopes=[scopes.CITIZEN_CATEGORY_VIEW]),
    ],
    db_session: AsyncSession = Depends(get_db),
) -> list[cc_schema.CitizenCategoryFolderOut]:
    items = await cc_dbapi.list_category_folders(
        db_session, category_id, user_id=user.id, public_only=False
    )
    if items is None:
        raise HTTP404NotFound()
    await db_session.commit()
    return items


@router.get(
    "/folders/{node_id}",
    response_model=list[cc_schema.CitizenCategoryOut],
)
async def get_folder_citizen_categories(
    node_id: UUID,
    user: Annotated[
        schema.User,
        Security(get_current_user, scopes=[scopes.CITIZEN_CATEGORY_VIEW]),
    ],
    db_session: AsyncSession = Depends(get_db),
) -> list[cc_schema.CitizenCategoryOut]:
    await dbapi_common.require_node_perm(
        db_session,
        node_id=node_id,
        codename=scopes.NODE_VIEW,
        user_id=user.id,
    )
    items = await cc_dbapi.get_folder_categories(db_session, node_id)
    if items is None:
        raise HTTP404NotFound()
    await db_session.commit()
    return items


@router.put(
    "/folders/{node_id}",
    response_model=list[cc_schema.CitizenCategoryOut],
)
async def set_folder_citizen_categories(
    node_id: UUID,
    payload: cc_schema.SetFolderCategoriesIn,
    user: Annotated[
        schema.User,
        Security(get_current_user, scopes=[scopes.CITIZEN_CATEGORY_UPDATE]),
    ],
    db_session: AsyncSession = Depends(get_db),
) -> list[cc_schema.CitizenCategoryOut]:
    await dbapi_common.require_node_perm(
        db_session,
        node_id=node_id,
        codename=scopes.NODE_UPDATE,
        user_id=user.id,
    )
    items, error = await cc_dbapi.set_folder_categories(
        db_session, node_id, list(payload.category_ids)
    )
    if error == "not_found":
        raise HTTP404NotFound()
    if error:
        raise HTTPException(status_code=400, detail=error)
    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="citizen_category_folder_set",
        resource_type="node",
        resource_id=node_id,
    )
    await db_session.commit()
    return items
