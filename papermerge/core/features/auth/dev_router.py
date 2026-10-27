"""Session switch for native auth bypass. Not mounted unless bypass is on."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import SecurityScopes
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from papermerge.core.db.engine import get_db
from papermerge.core.features.auth.dev_session import (
    DEV_USER_COOKIE,
    requested_dev_username_from_request,
    resolve_dev_bypass_user,
)
from papermerge.core.features.users.db.orm import User
from papermerge.core.features.users.schema import user_display_name

router = APIRouter(prefix="/dev", tags=["dev-session"])


class DevSessionUser(BaseModel):
    username: str
    label: str
    is_superuser: bool
    roles: list[str]


class DevSessionState(BaseModel):
    enabled: bool = True
    username: str
    users: list[DevSessionUser]


class DevSessionUpdate(BaseModel):
    username: str = Field(min_length=1, max_length=150)


async def _active_users(db_session: AsyncSession) -> list[DevSessionUser]:
    stmt = (
        select(User)
        .where(User.is_active.is_(True))
        .options(selectinload(User.roles))
        .order_by(User.is_superuser.desc(), User.username)
    )
    rows = (await db_session.scalars(stmt)).unique().all()
    items: list[DevSessionUser] = []
    for row in rows:
        role_names = sorted(role.name for role in row.roles)
        items.append(
            DevSessionUser(
                username=row.username,
                label=user_display_name(row.first_name, row.last_name, row.username),
                is_superuser=row.is_superuser,
                roles=role_names,
            )
        )
    return items


@router.get("/session", response_model=DevSessionState)
async def get_dev_session(
    request: Request,
    db_session: AsyncSession = Depends(get_db),
) -> DevSessionState:
    user = await resolve_dev_bypass_user(
        db_session,
        requested_dev_username_from_request(request),
        SecurityScopes(),
    )
    return DevSessionState(username=user.username, users=await _active_users(db_session))


@router.post("/session", response_model=DevSessionState)
async def set_dev_session(
    body: DevSessionUpdate,
    response: Response,
    db_session: AsyncSession = Depends(get_db),
) -> DevSessionState:
    users = await _active_users(db_session)
    match = next((item for item in users if item.username == body.username), None)
    if match is None:
        raise HTTPException(status_code=404, detail="User not found")
    response.set_cookie(
        DEV_USER_COOKIE,
        match.username,
        path="/",
        samesite="lax",
        httponly=False,
        max_age=60 * 60 * 24 * 30,
    )
    return DevSessionState(username=match.username, users=users)
