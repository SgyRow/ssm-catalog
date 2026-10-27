from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Security, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import exceptions as exc
from papermerge.core import schema
from papermerge.core.db.engine import get_db
from papermerge.core.features.auth import get_current_user, scopes
from papermerge.core.features.handbook import schema as hb_schema
from papermerge.core.features.handbook.db import api as hb_api

router = APIRouter(prefix="/handbook", tags=["handbook"])

MAX_ASSET_BYTES = 15 * 1024 * 1024


def _can_manage(user: schema.User) -> bool:
    if user.is_superuser:
        return True
    return scopes.PORTAL_FEED_MANAGE in (user.scopes or [])


@router.get("", response_model=list[hb_schema.HandbookArticleOut])
async def list_handbook(
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> list[hb_schema.HandbookArticleOut]:
    _ = user
    rows = await hb_api.list_articles(db_session)
    return [hb_schema.HandbookArticleOut(**row) for row in rows]


@router.post("", response_model=hb_schema.HandbookArticleOut)
async def create_handbook(
    payload: hb_schema.HandbookArticleCreateIn,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> hb_schema.HandbookArticleOut:
    if not _can_manage(user):
        raise exc.HTTP403Forbidden()
    row = await hb_api.create_article(
        db_session,
        title=payload.title,
        body=payload.body,
        author_id=user.id,
    )
    await db_session.commit()
    return hb_schema.HandbookArticleOut(**row)


@router.get("/assets/{asset_id}")
async def download_handbook_asset(
    asset_id: UUID,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
):
    _ = user
    found = await hb_api.get_asset(db_session, asset_id)
    if found is None:
        raise exc.HTTP404NotFound()
    asset, path = found
    return FileResponse(
        path,
        media_type=asset.content_type,
        filename=asset.filename,
    )


@router.get("/{article_id}", response_model=hb_schema.HandbookArticleOut)
async def get_handbook(
    article_id: UUID,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> hb_schema.HandbookArticleOut:
    _ = user
    row = await hb_api.get_article(db_session, article_id)
    if row is None:
        raise exc.HTTP404NotFound()
    return hb_schema.HandbookArticleOut(**row)


@router.patch("/{article_id}", response_model=hb_schema.HandbookArticleOut)
async def update_handbook(
    article_id: UUID,
    payload: hb_schema.HandbookArticleUpdateIn,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> hb_schema.HandbookArticleOut:
    if not _can_manage(user):
        raise exc.HTTP403Forbidden()
    row = await hb_api.update_article(
        db_session,
        article_id,
        title=payload.title,
        body=payload.body,
    )
    if row is None:
        raise exc.HTTP404NotFound()
    await db_session.commit()
    return hb_schema.HandbookArticleOut(**row)


@router.delete("/{article_id}", status_code=204)
async def delete_handbook(
    article_id: UUID,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> None:
    if not _can_manage(user):
        raise exc.HTTP403Forbidden()
    ok = await hb_api.delete_article(db_session, article_id)
    if not ok:
        raise exc.HTTP404NotFound()
    await db_session.commit()


@router.post("/{article_id}/assets", response_model=hb_schema.HandbookAssetOut)
async def upload_handbook_asset(
    article_id: UUID,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
    file: UploadFile = File(...),
) -> hb_schema.HandbookAssetOut:
    if not _can_manage(user):
        raise exc.HTTP403Forbidden()
    data = await file.read()
    if len(data) > MAX_ASSET_BYTES:
        raise HTTPException(status_code=400, detail="File is too large")
    row = await hb_api.add_asset(
        db_session,
        article_id=article_id,
        filename=file.filename or "file",
        content_type=file.content_type or "application/octet-stream",
        data=data,
    )
    if row is None:
        raise exc.HTTP404NotFound()
    await db_session.commit()
    return hb_schema.HandbookAssetOut(**row)
