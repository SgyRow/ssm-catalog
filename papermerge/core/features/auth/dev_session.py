"""Dev-only identity switch used by native auth bypass.

The configured bypass account (usually ``admin``) and any superuser keep
every scope. Any other active account is authenticated with only the
scopes of its database roles plus the baseline authenticated scopes.
"""

from __future__ import annotations

import logging

from fastapi import Request
from fastapi.security import SecurityScopes
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.websockets import WebSocket

from papermerge.core import exceptions as exc
from papermerge.core.config import get_settings
from papermerge.core.features.auth import scopes
from papermerge.core.features.users import schema as users_schema
from papermerge.core.features.users.db import api as usr_dbapi

logger = logging.getLogger(__name__)

DEV_USER_COOKIE = "pm_dev_user"
DEV_USER_HEADER = "x-pm-dev-user"
DEV_USER_QUERY = "dev_user"

# Imported lazily-friendly constant; auth.__init__ owns the canonical list
# but importing it here would cycle. Kept in sync with BASELINE_AUTHENTICATED_SCOPES.
_BASELINE_SCOPES = (scopes.NODE_VIEW,)


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


def requested_dev_username_from_request(request: Request) -> str | None:
    return (
        _clean(request.headers.get(DEV_USER_HEADER))
        or _clean(request.query_params.get(DEV_USER_QUERY))
        or _clean(request.cookies.get(DEV_USER_COOKIE))
    )


def requested_dev_username_from_ws(websocket: WebSocket) -> str | None:
    return (
        _clean(websocket.headers.get(DEV_USER_HEADER))
        or _clean(websocket.query_params.get(DEV_USER_QUERY))
        or _clean(websocket.cookies.get(DEV_USER_COOKIE))
    )


async def _load_active_user(
    db_session: AsyncSession, username: str
) -> users_schema.User | None:
    try:
        user = await usr_dbapi.get_user(db_session, username)
    except Exception:
        return None
    if not user.is_active:
        return None
    return user


async def _ensure_bypass_admin(
    db_session: AsyncSession, username: str
) -> users_schema.User:
    existing = await _load_active_user(db_session, username)
    if existing is not None:
        return existing
    user, error = await usr_dbapi.create_user(
        db_session,
        username=username,
        email=f"{username}@local.dev",
        password="-",
        is_superuser=True,
        is_active=True,
    )
    if not user or error:
        logger.error("Failed to create dev bypass user: %s", error)
        raise exc.HTTP401Unauthorized()
    return user


async def resolve_dev_bypass_user(
    db_session: AsyncSession,
    requested_username: str | None,
    security_scopes: SecurityScopes,
) -> users_schema.User:
    """Authenticate the native-dev request as admin or as a plain account."""
    settings = get_settings()
    default_name = settings.papermerge__dev__auth_bypass_username
    requested = _clean(requested_username)
    name = requested or default_name

    user = await _load_active_user(db_session, name)
    if user is None:
        if requested and requested != default_name:
            logger.warning(
                "Dev session user %r is missing or inactive; using %r",
                requested,
                default_name,
            )
        user = await _ensure_bypass_admin(db_session, default_name)
        user.scopes = sorted(scopes.SCOPES.keys())
        return user

    if user.is_superuser:
        user.scopes = sorted(scopes.SCOPES.keys())
        return user

    total_scopes = set(
        await usr_dbapi.get_user_scopes_from_db_roles(db_session, user_id=user.id)
    )
    total_scopes.update(_BASELINE_SCOPES)
    for scope in security_scopes.scopes:
        if scope not in total_scopes:
            raise exc.HTTP403Forbidden()
    user.scopes = sorted(total_scopes)
    return user
