from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Security, status
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import exceptions as exc
from papermerge.core import schema
from papermerge.core.db.engine import get_db
from papermerge.core.features.auth import get_current_user
from papermerge.core.features.library_ts.db import api as lib_ts_api
from papermerge.core.features.services import schema as svc_schema
from papermerge.core.features.services.db import api as svc_api

router = APIRouter(prefix="/services", tags=["services"])


def _require_admin(user: schema.User) -> None:
    if not user.is_superuser:
        raise exc.HTTP403Forbidden()


@router.get("", response_model=list[svc_schema.ServiceOut])
@router.get("/", response_model=list[svc_schema.ServiceOut])
async def list_services(
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> list[svc_schema.ServiceOut]:
    _ = user
    rows = await svc_api.list_services(db_session)
    await db_session.commit()
    return [svc_schema.ServiceOut.model_validate(row) for row in rows]


@router.post("", response_model=svc_schema.ServiceOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=svc_schema.ServiceOut, status_code=status.HTTP_201_CREATED)
async def create_service(
    payload: svc_schema.ServiceCreateIn,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> svc_schema.ServiceOut:
    _require_admin(user)
    row = await svc_api.create_service(
        db_session,
        title=payload.title,
        url=payload.url,
        logo_url=payload.logo_url,
    )
    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="service_create",
        resource_type="service",
        resource_id=row.id,
        detail=lib_ts_api.audit_detail_json({"title": row.title, "url": row.url}),
    )
    await db_session.commit()
    return svc_schema.ServiceOut.model_validate(row)


@router.delete("/{service_id}", status_code=204)
async def delete_service(
    service_id: UUID,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> None:
    _require_admin(user)
    error = await svc_api.delete_service(db_session, service_id)
    if error == "not_found":
        raise exc.HTTP404NotFound()
    if error == "builtin":
        raise HTTPException(status_code=400, detail="Built-in services cannot be deleted")
    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="service_delete",
        resource_type="service",
        resource_id=service_id,
    )
    await db_session.commit()
