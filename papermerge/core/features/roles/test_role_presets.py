"""Built-in roles seeded on deploy (Docker entrypoint / ``paper-cli roles``).

* **admin** — all scopes (handled by ``create_admin``; kept in sync on boot).
* **moderator** — same scope set as admin; non-superusers get full app rights via this role.
* **employee** — browse/download/view metadata, portal read, create comments and ratings;
  may edit/delete own comments without moderation scopes; may view/select tags but not
  create/update/delete tags; no node/document/page edits and no private library notes
  (notes require ``node.update``).
"""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import orm
from papermerge.core.features.auth.scopes import Scopes
from papermerge.core.features.roles import schema as roles_schema
from papermerge.core.features.roles.db import api as roles_dbapi
from papermerge.core.features.roles.db.orm import users_roles_association

MODERATOR_ROLE_NAME = "moderator"
EMPLOYEE_ROLE_NAME = "employee"

OBSOLETE_SEEDED_ROLE_NAMES = frozenset(
    {"worker", "modder", "editor_ts", "reader_ts"}
)


def full_access_scopes() -> list[str]:
    return sorted(Scopes.all_scopes())


def employee_scopes() -> list[str]:
    """Read-only document tree + collaboration (comments, ratings), no content edits."""
    return sorted(
        {
            Scopes.COMMANDER_VIEW,
            Scopes.NODE_VIEW,
            Scopes.DOCUMENT_DOWNLOAD,
            Scopes.DOCUMENT_DOWNLOAD_ALL_VERSIONS,
            Scopes.DOCUMENT_DOWNLOAD_LAST_VERSION_ONLY,
            Scopes.TAG_VIEW,
            Scopes.TAG_SELECT,
            Scopes.USER_ME,
            Scopes.OCRLANG_VIEW,
            Scopes.PORTAL_VIEW,
            Scopes.PORTAL_FEED_VIEW,
            Scopes.CITIZEN_CATEGORY_VIEW,
            Scopes.PAGE_VIEW,
            Scopes.SHARED_NODE_VIEW,
            Scopes.COMMENT_CREATE,
            Scopes.DOCUMENT_FULL_VERSION_VIEW,
        }
    )


PRESET_SCOPES: dict[str, list[str]] = {
    MODERATOR_ROLE_NAME: full_access_scopes(),
    EMPLOYEE_ROLE_NAME: employee_scopes(),
}


async def prune_obsolete_seeded_roles(db_session: AsyncSession) -> None:
    """Remove legacy preset roles so a rebuilt stack only exposes the new built-ins."""
    for name in OBSOLETE_SEEDED_ROLE_NAMES:
        stmt = select(orm.Role).where(orm.Role.name == name)
        role = (await db_session.execute(stmt)).scalar_one_or_none()
        if role is None:
            continue
        await db_session.execute(
            delete(users_roles_association).where(
                users_roles_association.c.role_id == role.id
            )
        )
        await db_session.commit()
        await roles_dbapi.delete_role(db_session, role_id=role.id)


async def ensure_preset_role(
    db_session: AsyncSession, role_name: str
) -> tuple[roles_schema.RoleDetails | None, str | None]:
    """Create or update a named preset role so scopes match the preset definition."""
    if role_name not in PRESET_SCOPES:
        known = ", ".join(sorted(PRESET_SCOPES))
        return None, f"Unknown preset role {role_name!r}. Known presets: {known}"

    wanted = PRESET_SCOPES[role_name]
    stmt = select(orm.Role).where(orm.Role.name == role_name)
    existing = (await db_session.execute(stmt)).scalar_one_or_none()

    if existing:
        attrs = roles_schema.UpdateRole(name=role_name, scopes=wanted)
        details, error = await roles_dbapi.update_role(db_session, existing.id, attrs)
        if error:
            return None, error
        return details, None

    role, error = await roles_dbapi.create_role(
        db_session, name=role_name, scopes=wanted, exists_ok=False
    )
    if error:
        return None, error
    return await roles_dbapi.get_role(db_session, role.id), None


async def ensure_all_preset_roles(
    db_session: AsyncSession,
) -> list[tuple[str, roles_schema.RoleDetails | None, str | None]]:
    """Drop legacy seeded roles, then create/update moderator and employee."""
    await prune_obsolete_seeded_roles(db_session)

    out: list[tuple[str, roles_schema.RoleDetails | None, str | None]] = []
    for name in PRESET_SCOPES:
        details, err = await ensure_preset_role(db_session, name)
        out.append((name, details, err))
    return out
