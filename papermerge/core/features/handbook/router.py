from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Security, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import exceptions as exc
from papermerge.core import schema
from papermerge.core.db.engine import get_db
from papermerge.core.features.auth import get_current_user, scopes
from papermerge.core.features.document.upload_pdf_convert import (
    UploadPdfConversionError,
    convert_upload_to_pdf_payload,
)
from papermerge.core.features.handbook import schema as hb_schema
from papermerge.core.features.handbook.db import api as hb_api

router = APIRouter(prefix="/handbook", tags=["handbook"])

MAX_ASSET_BYTES = 15 * 1024 * 1024


def _can_manage(user: schema.User) -> bool:
    if user.is_superuser:
        return True
    return scopes.PORTAL_FEED_MANAGE in (user.scopes or [])


def _folder_http_error(err: str) -> None:
    if err == "duplicate_title":
        raise HTTPException(status_code=409, detail="Folder title already exists")
    if err == "invalid_title":
        raise HTTPException(status_code=400, detail="Invalid folder title")
    if err == "folder_not_found":
        raise exc.HTTP404NotFound()
    raise HTTPException(status_code=400, detail=err)


async def _prepare_document_upload(
    file: UploadFile,
) -> tuple[bytes, str, str]:
    """
    Read upload and convert to PDF when the library would.

    Returns ``(data, stored_filename, content_type)``.
    """
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_ASSET_BYTES:
        raise HTTPException(status_code=400, detail="File is too large")
    original_name = (file.filename or "file").strip() or "file"
    try:
        data, stored_name, content_type = await convert_upload_to_pdf_payload(
            data=data,
            file_name=original_name,
            content_type=file.content_type,
        )
    except UploadPdfConversionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if len(data) > MAX_ASSET_BYTES:
        raise HTTPException(status_code=400, detail="File is too large")
    return data, stored_name, content_type


@router.get("", response_model=list[hb_schema.HandbookArticleOut])
async def list_handbook(
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> list[hb_schema.HandbookArticleOut]:
    _ = user
    rows = await hb_api.list_articles(db_session)
    return [hb_schema.HandbookArticleOut(**row) for row in rows]


@router.get("/folders", response_model=list[hb_schema.HandbookFolderOut])
async def list_handbook_folders(
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> list[hb_schema.HandbookFolderOut]:
    _ = user
    rows = await hb_api.list_folders(db_session)
    return [hb_schema.HandbookFolderOut(**row) for row in rows]


@router.post("/folders", response_model=hb_schema.HandbookFolderOut)
async def create_handbook_folder(
    payload: hb_schema.HandbookFolderCreateIn,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> hb_schema.HandbookFolderOut:
    if not _can_manage(user):
        raise exc.HTTP403Forbidden()
    row, err = await hb_api.create_folder(db_session, title=payload.title)
    if err:
        _folder_http_error(err)
    assert row is not None
    await db_session.commit()
    return hb_schema.HandbookFolderOut(**row)


@router.patch("/folders/{folder_id}", response_model=hb_schema.HandbookFolderOut)
async def update_handbook_folder(
    folder_id: UUID,
    payload: hb_schema.HandbookFolderUpdateIn,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> hb_schema.HandbookFolderOut:
    if not _can_manage(user):
        raise exc.HTTP403Forbidden()
    row, err = await hb_api.update_folder(
        db_session, folder_id, title=payload.title
    )
    if err:
        _folder_http_error(err)
    assert row is not None
    await db_session.commit()
    return hb_schema.HandbookFolderOut(**row)


@router.delete("/folders/{folder_id}", status_code=204)
async def delete_handbook_folder(
    folder_id: UUID,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> None:
    if not _can_manage(user):
        raise exc.HTTP403Forbidden()
    ok = await hb_api.delete_folder(db_session, folder_id)
    if not ok:
        raise exc.HTTP404NotFound()
    await db_session.commit()


@router.post("", response_model=hb_schema.HandbookArticleOut)
async def create_handbook(
    payload: hb_schema.HandbookArticleCreateIn,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> hb_schema.HandbookArticleOut:
    if not _can_manage(user):
        raise exc.HTTP403Forbidden()
    row, err = await hb_api.create_article(
        db_session,
        title=payload.title,
        body=payload.body,
        author_id=user.id,
        folder_id=payload.folder_id,
    )
    if err:
        _folder_http_error(err)
    assert row is not None
    await db_session.commit()
    return hb_schema.HandbookArticleOut(**row)


@router.post("/documents", response_model=hb_schema.HandbookArticleOut)
async def create_handbook_document(
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
    file: UploadFile = File(...),
    folder_id: UUID | None = Form(None),
) -> hb_schema.HandbookArticleOut:
    if not _can_manage(user):
        raise exc.HTTP403Forbidden()
    data, filename, content_type = await _prepare_document_upload(file)
    row, err = await hb_api.create_file_document(
        db_session,
        title=filename,
        author_id=user.id,
        filename=filename,
        content_type=content_type,
        data=data,
        folder_id=folder_id,
    )
    if err:
        _folder_http_error(err)
    assert row is not None
    await db_session.commit()
    return hb_schema.HandbookArticleOut(**row)


@router.post(
    "/documents/{article_id}/replace", response_model=hb_schema.HandbookArticleOut
)
async def replace_handbook_document(
    article_id: UUID,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
    file: UploadFile = File(...),
) -> hb_schema.HandbookArticleOut:
    if not _can_manage(user):
        raise exc.HTTP403Forbidden()
    data, filename, content_type = await _prepare_document_upload(file)
    row = await hb_api.replace_file_document(
        db_session,
        article_id,
        filename=filename,
        content_type=content_type,
        data=data,
    )
    if row is None:
        raise exc.HTTP404NotFound()
    await db_session.commit()
    return hb_schema.HandbookArticleOut(**row)


@router.get("/documents/{article_id}/download")
async def download_handbook_document(
    article_id: UUID,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
    inline: bool = False,
):
    found = await hb_api.get_file_document(db_session, article_id)
    if found is None:
        raise exc.HTTP404NotFound()
    article, path = found
    content_type = article.file_content_type or "application/octet-stream"
    if inline:
        return FileResponse(path, media_type=content_type)
    return FileResponse(
        path,
        media_type=content_type,
        filename=article.file_filename or article.title,
    )


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
    fields = payload.model_dump(exclude_unset=True)
    row, err = await hb_api.update_article(
        db_session,
        article_id,
        title=fields.get("title"),
        body=fields.get("body"),
        folder_id=fields.get("folder_id"),
        set_folder_id="folder_id" in fields,
    )
    if err == "not_found":
        raise exc.HTTP404NotFound()
    if err:
        _folder_http_error(err)
    assert row is not None
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
