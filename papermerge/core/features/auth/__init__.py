import logging
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, SecurityScopes
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import exceptions as exc
from papermerge.core import types
from papermerge.core.features.users.db import api as usr_dbapi
from papermerge.core.features.users import schema as users_schema
from papermerge.core.features.auth import scopes
from papermerge.core.db import exceptions as db_exc
from papermerge.core.config import get_settings
from papermerge.core.features.auth.jwt_tokens import verify_access_token
from papermerge.core.db.engine import get_db

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="auth/token/",
    auto_error=False,
    scopes=scopes.SCOPES,
)

logger = logging.getLogger(__name__)

BASELINE_AUTHENTICATED_SCOPES = [scopes.NODE_VIEW]

NODE_TAGS_SCOPES = frozenset(
    {scopes.NODE_UPDATE, scopes.DOCUMENT_UPDATE_TAGS, scopes.TAG_SELECT}
)


def extract_token_data(token: str = Depends(oauth2_scheme)) -> types.TokenData | None:
    if not token:
        return None

    data = verify_access_token(token)
    if data is None:
        return None

    user_id: str = data.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is missing `sub` field",
        )
    return types.TokenData(
        scopes=data.get("scopes", []),
        user_id=user_id,
        username=data.get("preferred_username"),
        email=data.get("email"),
        groups=data.get("groups", []),
        roles=data.get("roles", []),
    )


async def get_current_user(
    security_scopes: SecurityScopes,
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db_session: AsyncSession = Depends(get_db),
) -> users_schema.User:
    settings = get_settings()

    # Browser downloads (anchor / location) send the cookie but not Authorization.
    if not token:
        cookie_token = request.cookies.get("access_token")
        token = cookie_token or None

    if not token and settings.papermerge__dev__auth_bypass_enabled:
        bypass_username = settings.papermerge__dev__auth_bypass_username
        try:
            user = await usr_dbapi.get_user(db_session, bypass_username)
        except Exception:
            user, error = await usr_dbapi.create_user(
                db_session,
                username=bypass_username,
                email=f"{bypass_username}@local.dev",
                password="-",
                is_superuser=True,
                is_active=True,
            )
            if not user or error:
                logger.error("Failed to create dev bypass user: %s", error)
                raise exc.HTTP401Unauthorized()

        user.scopes = sorted(scopes.SCOPES.keys())
        return user

    if not token:
        raise exc.HTTP401Unauthorized()

    token_data = extract_token_data(token)
    if token_data is None:
        raise exc.HTTP401Unauthorized()

    try:
        user = await usr_dbapi.get_user(db_session, token_data.username)
    except db_exc.UserNotFound:
        # JIT-provision users that authenticated successfully but haven't been
        # seen locally yet (e.g. OIDC first login).
        user = await usr_dbapi.create_user(
            db_session,
            username=token_data.username,
            email=token_data.email,
            user_id=UUID(token_data.user_id),
            password="-",
        )

    total_scopes = list(token_data.scopes)
    # Baseline read access for authenticated users so they can load Home.
    total_scopes.extend(BASELINE_AUTHENTICATED_SCOPES)
    if user.is_superuser:
        total_scopes.extend(scopes.SCOPES.keys())
    if token_data.groups:
        total_scopes.extend(
            await usr_dbapi.get_user_scopes_from_groups(
                db_session, user_id=user.id, groups=token_data.groups
            )
        )
    if token_data.roles:
        total_scopes.extend(
            await usr_dbapi.get_user_scopes_from_roles(
                db_session, user_id=user.id, roles=token_data.roles
            )
        )
        # Persist role links so recipient_role-based sharing checks can match.
        await usr_dbapi.attach_user_roles_by_names(
            db_session, user_id=user.id, roles=token_data.roles
        )

    total_scopes.extend(
        await usr_dbapi.get_user_scopes_from_db_roles(
            db_session, user_id=user.id
        )
    )

    for scope in security_scopes.scopes:
        if scope not in total_scopes:
            raise exc.HTTP403Forbidden()

    user.scopes = sorted(set(total_scopes))
    return user


async def require_node_tags_user(
    user: Annotated[users_schema.User, Depends(get_current_user)],
) -> users_schema.User:
    """Authenticated user with ``node.update``, ``document.update.tags``, or ``tag.select``."""
    if not set(user.scopes or []).intersection(NODE_TAGS_SCOPES):
        raise exc.HTTP403Forbidden()
    return user
