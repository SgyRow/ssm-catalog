from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core.db.engine import get_db
from papermerge.core.exceptions import HTTP404NotFound
from papermerge.core.features.citizen_categories import schema as cc_schema
from papermerge.core.features.citizen_categories.db import api as cc_dbapi

router = APIRouter(prefix="/public/citizen-categories", tags=["public"])


@router.get("", response_model=list[cc_schema.CitizenCategoryOut])
async def list_public_citizen_categories(
    db_session: AsyncSession = Depends(get_db),
) -> list[cc_schema.CitizenCategoryOut]:
    items = await cc_dbapi.list_categories(db_session)
    await db_session.commit()
    return items


@router.get(
    "/{category_id}/folders",
    response_model=list[cc_schema.CitizenCategoryFolderOut],
)
async def list_public_citizen_category_folders(
    category_id: UUID,
    db_session: AsyncSession = Depends(get_db),
) -> list[cc_schema.CitizenCategoryFolderOut]:
    items = await cc_dbapi.list_category_folders(
        db_session, category_id, user_id=None, public_only=True
    )
    if items is None:
        raise HTTP404NotFound()
    await db_session.commit()
    return items
