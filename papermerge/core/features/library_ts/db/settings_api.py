import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import orm
from papermerge.core.config import get_settings
from papermerge.core.features.library_ts.constants import LIBRARY_SETTINGS_ROW_ID
from papermerge.core.features.library_ts.db.settings_orm import LibrarySettings

logger = logging.getLogger(__name__)


async def get_library_settings_row(
    db_session: AsyncSession,
) -> LibrarySettings | None:
    stmt = select(LibrarySettings).where(LibrarySettings.id == LIBRARY_SETTINGS_ROW_ID)
    return (await db_session.scalars(stmt)).one_or_none()


async def ensure_library_settings_row(db_session: AsyncSession) -> LibrarySettings:
    row = await get_library_settings_row(db_session)
    if row is not None:
        return row
    settings = get_settings()
    row = LibrarySettings(
        id=LIBRARY_SETTINGS_ROW_ID,
        trash_retention_days=settings.papermerge__main__trash_retention_days,
    )
    db_session.add(row)
    await db_session.flush()
    return row


async def get_trash_retention_days(db_session: AsyncSession) -> int:
    settings = get_settings()
    row = await get_library_settings_row(db_session)
    if row is not None and row.trash_retention_days is not None:
        return row.trash_retention_days
    return settings.papermerge__main__trash_retention_days


async def set_trash_retention_days(db_session: AsyncSession, days: int) -> int:
    if days < 1:
        raise ValueError("trash_retention_days must be at least 1")
    row = await ensure_library_settings_row(db_session)
    row.trash_retention_days = days
    await db_session.commit()
    return days


async def get_catalog_root_id(db_session: AsyncSession) -> UUID | None:
    settings = get_settings()
    env_root = settings.papermerge__library__catalog_root_node_id
    if env_root:
        return UUID(str(env_root))

    row = await get_library_settings_row(db_session)
    if row is None:
        return None
    return row.catalog_root_node_id


async def ensure_library_catalog_bootstrap(
    db_session: AsyncSession,
    admin_username: str | None = None,
) -> tuple[UUID | None, str | None]:
    """Ensure library_settings row exists; prefer portal root as catalog root."""
    settings = get_settings()
    if settings.papermerge__library__catalog_root_node_id:
        root_id = UUID(str(settings.papermerge__library__catalog_root_node_id))
        row = await get_library_settings_row(db_session)
        if row is None:
            db_session.add(
                LibrarySettings(
                    id=LIBRARY_SETTINGS_ROW_ID,
                    catalog_root_node_id=root_id,
                )
            )
        elif row.catalog_root_node_id != root_id:
            row.catalog_root_node_id = root_id
        await db_session.commit()
        return root_id, None

    from papermerge.core.features.portal.db import api as portal_dbapi

    portal_root_id = await portal_dbapi.get_portal_root_id(db_session)
    row = await get_library_settings_row(db_session)

    if portal_root_id:
        if row is None:
            db_session.add(
                LibrarySettings(
                    id=LIBRARY_SETTINGS_ROW_ID,
                    catalog_root_node_id=portal_root_id,
                )
            )
        elif row.catalog_root_node_id != portal_root_id:
            row.catalog_root_node_id = portal_root_id
        await db_session.commit()
        logger.info(
            "Library catalog bootstrap: catalog_root_node_id=%s (portal root)",
            portal_root_id,
        )
        return portal_root_id, None

    if row and row.catalog_root_node_id:
        await db_session.commit()
        return row.catalog_root_node_id, None

    username = admin_username or settings.papermerge__dev__auth_bypass_username
    if not username:
        username = "admin"

    user = await db_session.scalar(
        select(orm.User).where(orm.User.username == username)
    )
    if user is None or user.home_folder_id is None:
        return None, f"Cannot bootstrap library catalog: user {username!r} has no home folder"

    root_id = user.home_folder_id
    if row is None:
        db_session.add(
            LibrarySettings(
                id=LIBRARY_SETTINGS_ROW_ID,
                catalog_root_node_id=root_id,
            )
        )
    else:
        row.catalog_root_node_id = root_id

    await db_session.commit()
    logger.info("Library catalog bootstrap: catalog_root_node_id=%s", root_id)
    return root_id, None
