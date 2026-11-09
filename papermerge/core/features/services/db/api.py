from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core.features.services.db.orm import (
    GOSUSLUGI_ID,
    GOSUSLUGI_SLUG,
    GOSUSLUGI_TITLE,
    GOSUSLUGI_URL,
    ExternalService,
)


async def ensure_gosuslugi(db_session: AsyncSession) -> None:
    existing = await db_session.scalar(
        select(ExternalService.id).where(ExternalService.slug == GOSUSLUGI_SLUG)
    )
    if existing is not None:
        return
    by_id = await db_session.get(ExternalService, GOSUSLUGI_ID)
    if by_id is not None:
        return
    db_session.add(
        ExternalService(
            id=GOSUSLUGI_ID,
            title=GOSUSLUGI_TITLE,
            url=GOSUSLUGI_URL,
            logo_url=None,
            slug=GOSUSLUGI_SLUG,
            builtin=True,
            sort_index=0,
        )
    )
    await db_session.flush()


async def list_services(db_session: AsyncSession) -> list[ExternalService]:
    await ensure_gosuslugi(db_session)
    stmt = select(ExternalService).order_by(
        ExternalService.sort_index.asc(),
        ExternalService.title.asc(),
    )
    return list((await db_session.scalars(stmt)).all())


async def create_service(
    db_session: AsyncSession,
    *,
    title: str,
    url: str,
    logo_url: str | None,
) -> ExternalService:
    max_index = await db_session.scalar(select(func.max(ExternalService.sort_index)))
    row = ExternalService(
        title=title,
        url=url,
        logo_url=logo_url,
        slug=None,
        builtin=False,
        sort_index=int(max_index or 0) + 1,
    )
    db_session.add(row)
    await db_session.flush()
    return row


async def delete_service(db_session: AsyncSession, service_id: UUID) -> str | None:
    row = await db_session.get(ExternalService, service_id)
    if row is None:
        return "not_found"
    if row.builtin:
        return "builtin"
    await db_session.delete(row)
    await db_session.flush()
    return None
