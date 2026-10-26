import logging
import os
import uuid
from typing import Union
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import NoResultFound
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import schema
from papermerge.core.db.common import get_ancestors
from papermerge.core.db.engine import get_db
from papermerge.core.exceptions import HTTP403Forbidden, HTTP404NotFound
from papermerge.core.features.document.db import api as doc_dbapi
from papermerge.core.features.document.response import DocumentFileResponse
from papermerge.core.features.library_ts.db import settings_api as library_settings_api
from papermerge.core.features.nodes.db import api as nodes_dbapi
from papermerge.core.features.nodes.db import orm as nodes_orm
from papermerge.core.features.nodes.schema import Folder, LibraryCatalogRoot, PublicDocumentMeta
from papermerge.core.features.nodes.visibility import can_view_node
from papermerge.core.pathlib import abs_docver_path, rel2abs, thumbnail_path
from papermerge.core.routers.params import CommonQueryParams
from papermerge.core.types import PaginatedResponse
from papermerge.core.features.nodes.router_thumbnails import (
    JPEGFileResponse,
    _generate_thumbnail_in_background,
    _thumbnail_jobs,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public", tags=["public"])


async def _is_catalog_root(db_session: AsyncSession, node_id: UUID) -> bool:
    root_id = await library_settings_api.get_catalog_root_id(db_session)
    return root_id is not None and root_id == node_id


async def _require_public_parent_access(
    db_session: AsyncSession, node_id: UUID
) -> None:
    if await _is_catalog_root(db_session, node_id):
        return
    if not await can_view_node(db_session, node_id=node_id, user_id=None):
        raise HTTP403Forbidden()


async def _public_breadcrumb(
    db_session: AsyncSession, node_id: UUID
) -> list[tuple[UUID, str]]:
    """Ancestor folders visible to guests (root → parent)."""
    breadcrumb: list[tuple[UUID, str]] = []
    for nid, title in await get_ancestors(db_session, node_id, include_self=False):
        if await can_view_node(db_session, node_id=nid, user_id=None):
            breadcrumb.append((nid, title))
    return breadcrumb


@router.get("/library/root")
async def get_public_library_root(
    db_session: AsyncSession = Depends(get_db),
) -> LibraryCatalogRoot:
    root_id = await library_settings_api.get_catalog_root_id(db_session)
    if root_id is None:
        raise HTTP404NotFound()

    db_folder, error = await nodes_dbapi.get_folder(db_session, folder_id=root_id)
    if error or db_folder is None:
        raise HTTP404NotFound()

    return LibraryCatalogRoot(id=db_folder.id, title=db_folder.title)


@router.get("/nodes/{parent_id}")
async def get_public_nodes(
    parent_id: UUID,
    params: CommonQueryParams = Depends(),
    db_session: AsyncSession = Depends(get_db),
) -> PaginatedResponse[Union[schema.DocumentNode, Folder]]:
    await _require_public_parent_access(db_session, parent_id)

    order_by = ["sort_index"]
    if params.order_by:
        order_by = [item.strip() for item in params.order_by.split(",")]

    return await nodes_dbapi.get_paginated_nodes(
        db_session=db_session,
        parent_id=parent_id,
        user_id=None,
        page_size=params.page_size,
        page_number=params.page_number,
        order_by=order_by,
        filter=params.filter,
    )


@router.get("/folders/{folder_id}")
async def get_public_folder(
    folder_id: UUID,
    db_session: AsyncSession = Depends(get_db),
) -> Folder:
    await _require_public_parent_access(db_session, folder_id)

    db_folder, error = await nodes_dbapi.get_folder(db_session, folder_id=folder_id)
    if error or db_folder is None:
        raise HTTP404NotFound()

    folder = Folder.model_validate(db_folder)
    folder.breadcrumb = await _public_breadcrumb(db_session, folder_id)
    return folder


@router.get("/documents/{document_id}")
async def get_public_document(
    document_id: UUID,
    db_session: AsyncSession = Depends(get_db),
) -> PublicDocumentMeta:
    if not await can_view_node(db_session, node_id=document_id, user_id=None):
        raise HTTP403Forbidden()

    db_doc = await db_session.scalar(
        select(nodes_orm.Node).where(
            nodes_orm.Node.id == document_id,
            nodes_orm.Node.ctype == "document",
            nodes_orm.Node.deleted_at.is_(None),
        )
    )
    if db_doc is None:
        raise HTTP404NotFound()

    try:
        doc_ver = await doc_dbapi.get_last_doc_ver(db_session, doc_id=document_id)
    except NoResultFound:
        raise HTTP404NotFound()

    return PublicDocumentMeta(
        id=db_doc.id,
        title=db_doc.title,
        parent_id=db_doc.parent_id,
        file_name=doc_ver.file_name,
        breadcrumb=await _public_breadcrumb(db_session, document_id),
    )


@router.get(
    "/thumbnails/{document_id}",
    response_class=JPEGFileResponse,
)
async def get_public_document_thumbnail(
    document_id: uuid.UUID,
    db_session: AsyncSession = Depends(get_db),
):
    if not await can_view_node(db_session, node_id=document_id, user_id=None):
        raise HTTP403Forbidden()

    try:
        doc_ver = await doc_dbapi.get_last_doc_ver(db_session, doc_id=document_id)
    except NoResultFound:
        raise HTTP404NotFound()
    try:
        page = await doc_dbapi.get_first_page(db_session, doc_ver_id=doc_ver.id)
    except NoResultFound:
        raise HTTPException(
            status_code=423,
            detail="Not ready for preview yet",
        )

    jpg_abs_path = rel2abs(thumbnail_path(page.id))

    if not os.path.exists(jpg_abs_path):
        if document_id not in _thumbnail_jobs:
            import asyncio

            _thumbnail_jobs[document_id] = asyncio.create_task(
                _generate_thumbnail_in_background(
                    document_id=document_id,
                    page_id=page.id,
                    doc_ver_id=doc_ver.id,
                    file_name=doc_ver.file_name,
                )
            )
        raise HTTPException(
            status_code=423,
            detail="Thumbnail is being prepared. Retry shortly.",
        )

    return JPEGFileResponse(jpg_abs_path)


@router.get(
    "/documents/{document_id}/download",
    response_class=DocumentFileResponse,
)
async def download_public_document(
    document_id: uuid.UUID,
    inline: bool = Query(default=True),
    db_session: AsyncSession = Depends(get_db),
):
    if not await can_view_node(db_session, node_id=document_id, user_id=None):
        raise HTTP403Forbidden()

    try:
        doc_ver = await doc_dbapi.get_last_doc_ver(db_session, doc_id=document_id)
    except NoResultFound:
        raise HTTP404NotFound()

    file_path = abs_docver_path(doc_ver.id, doc_ver.file_name)
    if not os.path.isfile(file_path):
        raise HTTP404NotFound()

    return DocumentFileResponse(
        str(file_path),
        filename=doc_ver.file_name,
        content_disposition_type="inline" if inline else "attachment",
    )
