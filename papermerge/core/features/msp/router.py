"""REST API for the МСП (Measures of Social Support) feature."""

from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Response,
    Security,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from papermerge.core import schema as core_schema
from papermerge.core.db import common as dbapi_common
from papermerge.core.db.engine import get_db
from papermerge.core.features.auth import get_current_user, scopes
from papermerge.core.features.msp import pdf as msp_pdf
from papermerge.core.features.msp.db import api, orm
from papermerge.core.features.msp.schema import (
    NewMsp,
    NewMspType,
    NewMspTypeSection,
    ReorderMspTypeSections,
    UpdateMspType,
    MspRead,
    MspSectionRead,
    MspTypeRead,
    MspTypeSectionRead,
    UpdateMsp,
)
from papermerge.core.features.nodes.db import orm as nodes_orm
from papermerge.core.routers.common import OPEN_API_GENERIC_JSON_DETAIL

router = APIRouter(prefix="/msp", tags=["msp"])


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _require_superuser(user: core_schema.User) -> None:
    if not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions",
        )


def _type_read(msp_type: orm.MspType) -> MspTypeRead:
    return MspTypeRead(
        id=msp_type.id,
        name=msp_type.name,
        description=msp_type.description,
        created_at=msp_type.created_at,
        updated_at=msp_type.updated_at,
        sections=[
            MspTypeSectionRead(id=s.id, title=s.title, sort_order=s.sort_order)
            for s in sorted(msp_type.sections, key=lambda x: x.sort_order)
        ],
    )


async def _node_title(db_session: AsyncSession, node_id: UUID) -> str:
    stmt = select(nodes_orm.Node.title).where(nodes_orm.Node.id == node_id)
    return (await db_session.execute(stmt)).scalar_one_or_none() or ""


def _msp_read(msp: orm.Msp, title: str) -> MspRead:
    return MspRead(
        id=msp.id,
        node_id=msp.node_id,
        title=title,
        msp_type_id=msp.msp_type_id,
        msp_type_name=msp.msp_type.name if msp.msp_type else "",
        sections=[
            MspSectionRead(
                id=s.id,
                type_section_id=s.type_section_id,
                title=s.title,
                body=s.body,
                hidden=s.hidden,
                sort_order=s.sort_order,
            )
            for s in sorted(msp.sections, key=lambda x: x.sort_order)
        ],
        created_at=msp.created_at,
        updated_at=msp.updated_at,
    )


async def _get_msp_or_404(db_session: AsyncSession, msp_id: UUID) -> orm.Msp:
    msp = await api.get_msp(db_session, msp_id)
    if msp is None:
        raise HTTPException(status_code=404, detail="Measure not found")
    return msp


# --------------------------------------------------------------------------- #
# Types (виды МСП)
# --------------------------------------------------------------------------- #
@router.get(
    "/types",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": "No permission",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def list_msp_types(
    user: Annotated[
        core_schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> list[MspTypeRead]:
    """List all measure types (with their sections)."""
    types = await api.list_msp_types(db_session)
    return [_type_read(t) for t in types]


@router.post(
    "/types",
    status_code=status.HTTP_201_CREATED,
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": "Administrator required",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def create_msp_type(
    payload: NewMspType,
    user: Annotated[core_schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> MspTypeRead:
    """Create a new measure type with its sections."""
    _require_superuser(user)
    msp_type = await api.create_msp_type(db_session, payload)
    return _type_read(msp_type)


@router.get(
    "/types/{msp_type_id}",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": "No permission",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def get_msp_type(
    msp_type_id: UUID,
    user: Annotated[
        core_schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> MspTypeRead:
    """Get a single measure type with its sections."""
    msp_type = await api.get_msp_type(db_session, msp_type_id)
    if msp_type is None:
        raise HTTPException(status_code=404, detail="Measure type not found")
    return _type_read(msp_type)


@router.patch(
    "/types/{msp_type_id}",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": "Administrator required",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def update_msp_type(
    msp_type_id: UUID,
    payload: UpdateMspType,
    user: Annotated[core_schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> MspTypeRead:
    """Update a measure type: name, description, and/or its sections."""
    _require_superuser(user)
    msp_type = await api.update_msp_type(
        db_session,
        msp_type_id,
        name=payload.name,
        description=payload.description,
        sections=payload.sections,
    )
    if msp_type is None:
        raise HTTPException(status_code=404, detail="Measure type not found")
    return _type_read(msp_type)


@router.post(
    "/types/{msp_type_id}/sections",
    status_code=status.HTTP_201_CREATED,
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": "Administrator required",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def add_msp_type_section(
    msp_type_id: UUID,
    payload: NewMspTypeSection,
    user: Annotated[core_schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> MspTypeSectionRead:
    """Add a new section to an existing measure type.

    ``index`` is the zero-based insertion position in the current ordered
    list (0 = first); omit it to append at the end.
    """
    _require_superuser(user)
    section = await api.add_msp_type_section(
        db_session, msp_type_id, payload.title, index=payload.index
    )
    if section is None:
        raise HTTPException(status_code=404, detail="Measure type not found")
    return MspTypeSectionRead(id=section.id, title=section.title, sort_order=section.sort_order)


@router.post(
    "/types/{msp_type_id}/sections/reorder",
    responses={
        status.HTTP_400_BAD_REQUEST: {
            "description": "Invalid order",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        },
        status.HTTP_403_FORBIDDEN: {
            "description": "Administrator required",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def reorder_msp_type_sections(
    msp_type_id: UUID,
    payload: ReorderMspTypeSections,
    user: Annotated[core_schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> MspTypeRead:
    """Move sections within a measure type.

    ``order`` is the full, ordered list of section ids; positions become
    the new order.
    """
    _require_superuser(user)
    try:
        msp_type = await api.reorder_msp_type_sections(
            db_session, msp_type_id, payload.order
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    if msp_type is None:
        raise HTTPException(status_code=404, detail="Measure type not found")
    return _type_read(msp_type)


@router.delete(
    "/types/{msp_type_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": "Administrator required",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def delete_msp_type(
    msp_type_id: UUID,
    user: Annotated[core_schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> None:
    """Delete a measure type (its sections are removed too)."""
    _require_superuser(user)
    await api.delete_msp_type(db_session, msp_type_id)
    return None


# --------------------------------------------------------------------------- #
# Measures (меры МСП)
# --------------------------------------------------------------------------- #
@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"No `{scopes.NODE_CREATE}` permission on the parent node",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def create_msp(
    payload: NewMsp,
    user: Annotated[
        core_schema.User, Security(get_current_user, scopes=[scopes.NODE_CREATE])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> MspRead:
    """Create a measure: a folder node plus its filled sections."""
    await dbapi_common.require_node_perm(
        db_session,
        node_id=payload.parent_id,
        codename=scopes.NODE_CREATE,
        user_id=user.id,
    )
    msp, _node_id, error = await api.create_msp(
        db_session,
        parent_id=payload.parent_id,
        title=payload.title,
        msp_type_id=payload.msp_type_id,
        sections=payload.sections,
    )
    if msp is None:
        message = error.messages[0] if error and error.messages else "Could not create measure"
        raise HTTPException(status_code=400, detail=message)
    return _msp_read(msp, title=payload.title)


@router.get(
    "/{msp_id}",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": "No permission",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def get_msp(
    msp_id: UUID,
    user: Annotated[
        core_schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> MspRead:
    """Get a measure with its sections."""
    msp = await _get_msp_or_404(db_session, msp_id)
    await dbapi_common.require_node_perm(
        db_session,
        node_id=msp.node_id,
        codename=scopes.NODE_VIEW,
        user_id=user.id,
    )
    title = await _node_title(db_session, msp.node_id)
    return _msp_read(msp, title=title)


@router.get(
    "/by-node/{node_id}",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": "No permission",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def get_msp_by_node(
    node_id: UUID,
    user: Annotated[
        core_schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> MspRead | None:
    """Return the measure anchored to a folder node, if any.

    Used by the portal folder page to decide whether to render the МСП view.
    """
    await dbapi_common.require_node_perm(
        db_session,
        node_id=node_id,
        codename=scopes.NODE_VIEW,
        user_id=user.id,
    )
    msp = await api.get_msp_by_node(db_session, node_id)
    if msp is None:
        return None
    title = await _node_title(db_session, msp.node_id)
    return _msp_read(msp, title=title)


@router.put(
    "/{msp_id}",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": "No permission",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def update_msp(
    msp_id: UUID,
    payload: UpdateMsp,
    user: Annotated[
        core_schema.User, Security(get_current_user, scopes=[scopes.NODE_UPDATE])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> MspRead:
    """Update a measure's title and/or sections."""
    msp = await _get_msp_or_404(db_session, msp_id)
    await dbapi_common.require_node_perm(
        db_session,
        node_id=msp.node_id,
        codename=scopes.NODE_UPDATE,
        user_id=user.id,
    )
    updated = await api.update_msp(
        db_session, msp_id=msp_id, title=payload.title, sections=payload.sections
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Measure not found")
    title = await _node_title(db_session, updated.node_id)
    return _msp_read(updated, title=title)


@router.delete(
    "/{msp_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": "No permission",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def delete_msp(
    msp_id: UUID,
    user: Annotated[
        core_schema.User, Security(get_current_user, scopes=[scopes.NODE_DELETE])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> None:
    """Delete a measure and its anchor folder node."""
    msp = await _get_msp_or_404(db_session, msp_id)
    await dbapi_common.require_node_perm(
        db_session,
        node_id=msp.node_id,
        codename=scopes.NODE_DELETE,
        user_id=user.id,
    )
    await api.delete_msp(db_session, msp_id)
    return None


@router.get(
    "/{msp_id}/pdf",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": "No permission",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def get_msp_pdf(
    msp_id: UUID,
    user: Annotated[
        core_schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> Response:
    """Render the measure to a PDF file (on the fly, from the stored sections)."""
    msp = await _get_msp_or_404(db_session, msp_id)
    await dbapi_common.require_node_perm(
        db_session,
        node_id=msp.node_id,
        codename=scopes.NODE_VIEW,
        user_id=user.id,
    )
    title = await _node_title(db_session, msp.node_id)
    data = msp_pdf.render_msp_pdf(msp, title)
    file_name = msp_pdf.pdf_file_name(title)
    quoted = quote(file_name)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=msp.pdf; filename*=UTF-8''{quoted}"
        },
    )
