import asyncio
import logging
import os
import uuid
from typing import Annotated

from sqlalchemy.exc import NoResultFound
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, HTTPException, Security, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel

from papermerge.core.features.users import schema as usr_schema
from papermerge.core.features.auth import get_current_user
from papermerge.core.features.auth import scopes
from papermerge.core.features.document.db import api as dbapi
from papermerge.core.pathlib import rel2abs, thumbnail_path
from papermerge.core.utils import image
from papermerge.core.db.common import require_node_perm
from papermerge.core.exceptions import HTTP403Forbidden, HTTP404NotFound
from papermerge.core.routers.common import OPEN_API_GENERIC_JSON_DETAIL
from papermerge.core.db.engine import get_db

router = APIRouter(
    prefix="/thumbnails",
    tags=["thumbnails"],
)

logger = logging.getLogger(__name__)
_thumbnail_jobs: dict[uuid.UUID, asyncio.Task] = {}


async def _generate_thumbnail_in_background(
    document_id: uuid.UUID,
    page_id: uuid.UUID,
    doc_ver_id: uuid.UUID,
    file_name: str,
):
    try:
        start = asyncio.get_running_loop().time()
        await asyncio.to_thread(
            image.gen_doc_thumbnail,
            page_id,
            doc_ver_id,
            1,
            file_name,
        )
        elapsed = (asyncio.get_running_loop().time() - start) * 1000
        logger.info(
            "thumbnail_generated document_id=%s doc_ver_id=%s elapsed_ms=%.2f",
            document_id,
            doc_ver_id,
            elapsed,
        )
    except Exception:
        logger.exception(
            "thumbnail_generation_failed document_id=%s doc_ver_id=%s",
            document_id,
            doc_ver_id,
        )
    finally:
        _thumbnail_jobs.pop(document_id, None)


class Message(BaseModel):
    detail: str


class JPEGFileResponse(FileResponse):
    media_type = "application/jpeg"


@router.get(
    "/{document_id}",
    response_class=JPEGFileResponse,
    responses={
        423: {
            "description": """Preview image cannot be generated at this moment
             yet. This may happen for example because the document is currently
            still being uploaded. A later response may succeed with 200 status
            code.""",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        },
        404: {
            "description": """Document with specified UUID was not found""",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        },
    },
)
async def get_document_thumbnail(
    document_id: uuid.UUID,
    user: Annotated[
        usr_schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])
    ],
    db_session: AsyncSession = Depends(get_db),
):
    """Retrieves thumbnail of the document last version's first page

    """

    await require_node_perm(
        db_session, user_id=user.id, codename=scopes.NODE_VIEW, node_id=document_id
    )

    try:
        doc_ver = await dbapi.get_last_doc_ver(db_session, doc_id=document_id)
    except NoResultFound:
        raise HTTP404NotFound
    try:
        page = await dbapi.get_first_page(db_session, doc_ver_id=doc_ver.id)
    except NoResultFound:
        raise HTTPException(
            status_code=423,
            detail="Not ready for preview yet",
        )

    jpg_abs_path = rel2abs(thumbnail_path(page.id))

    if not os.path.exists(jpg_abs_path):
        if document_id not in _thumbnail_jobs:
            logger.info(
                "thumbnail_generation_queued document_id=%s doc_ver_id=%s",
                document_id,
                doc_ver.id,
            )
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

    if not os.path.exists(jpg_abs_path):
        raise HTTP404NotFound

    return JPEGFileResponse(jpg_abs_path)
