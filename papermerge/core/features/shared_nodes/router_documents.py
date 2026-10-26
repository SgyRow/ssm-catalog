import uuid
from typing import Annotated

from fastapi import APIRouter, Security, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import NoResultFound

from papermerge.core.features.auth import get_current_user
from papermerge.core.features.auth import scopes
from papermerge.core.db import common as dbapi_common
from papermerge.core.exceptions import HTTP403Forbidden
from papermerge.core import schema
from papermerge.core.db.engine import get_db
from .db import api as dbapi

router = APIRouter(prefix="/shared-documents", tags=["shared-documents"])


@router.get("/{document_id}")
async def get_shared_document_details(
    document_id: uuid.UUID,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    shared_root_id: uuid.UUID | None = None,
    db_session: AsyncSession = Depends(get_db),
) -> schema.Document:
    """
    Get shared document details

    """
    try:
        await dbapi_common.require_node_perm(
            db_session,
            node_id=document_id,
            codename=scopes.NODE_VIEW,
            user_id=user.id,
        )

        doc = await dbapi.get_shared_doc(
            db_session,
            document_id=document_id,
            shared_root_id=shared_root_id,
            user_id=user.id,
        )
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc
