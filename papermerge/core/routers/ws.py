import asyncio
import json
from uuid import UUID

from fastapi import APIRouter, WebSocket
from fastapi.security import SecurityScopes
from starlette.websockets import WebSocketDisconnect
from sqlalchemy import func, select

from papermerge.core.db.engine import AsyncSessionLocal
from papermerge.core.features.auth import extract_token_data
from papermerge.core.features.auth.dev_session import (
    requested_dev_username_from_ws,
    resolve_dev_bypass_user,
)
from papermerge.core.features.library_ts.db import orm as lib_orm
from papermerge.core.config import get_settings

router = APIRouter()
settings = get_settings()


async def resolve_ws_user_id(
    token: str | None, dev_username: str | None = None
) -> UUID | None:
    if token:
        token_data = extract_token_data(token)
        if token_data and token_data.user_id:
            return UUID(token_data.user_id)

    if settings.papermerge__dev__auth_bypass_enabled:
        async with AsyncSessionLocal() as db_session:
            user = await resolve_dev_bypass_user(
                db_session, dev_username, SecurityScopes()
            )
            return UUID(str(user.id))
    return None


async def notifications_marker(user_id: UUID) -> tuple[int, str]:
    async with AsyncSessionLocal() as db_session:
        row = (
            await db_session.execute(
                select(
                    func.count(lib_orm.UserNotification.id),
                    func.max(lib_orm.UserNotification.created_at),
                ).where(lib_orm.UserNotification.user_id == user_id)
            )
        ).one()
        max_created = row[1].isoformat() if row[1] else ""
        return int(row[0] or 0), max_created


@router.websocket("/ws")
async def ws_notifications(websocket: WebSocket):
    token = websocket.query_params.get("token")
    user_id = await resolve_ws_user_id(
        token, requested_dev_username_from_ws(websocket)
    )
    if not user_id:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    last_marker = await notifications_marker(user_id)
    try:
        await websocket.send_text(
            json.dumps({"type": "connected", "payload": {"notifications": True}})
        )
    except WebSocketDisconnect:
        return

    try:
        while True:
            await asyncio.sleep(2)
            current_marker = await notifications_marker(user_id)
            if current_marker != last_marker:
                last_marker = current_marker
                try:
                    await websocket.send_text(
                        json.dumps({"type": "notifications_updated", "payload": {}})
                    )
                except WebSocketDisconnect:
                    return
    except WebSocketDisconnect:
        return
    except Exception:
        try:
            await websocket.close()
        except Exception:
            pass
