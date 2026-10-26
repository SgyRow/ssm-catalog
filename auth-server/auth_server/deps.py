from uuid import UUID

import jwt
from fastapi import HTTPException, Request, status

from auth_server import schema
from auth_server.config import get_settings
from auth_server.db.engine import Session
from auth_server.db import api as dbapi
from auth_server import utils


settings = get_settings()


def get_current_user(request: Request) -> schema.User:
    token = utils.get_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    try:
        decoded_token = jwt.decode(
            token,
            settings.papermerge__security__secret_key,
            algorithms=[settings.papermerge__security__token_algorithm],
        )
    except jwt.DecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from exc

    user_id = decoded_token.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="sub key not present in decoded token",
        )

    try:
        with Session() as db_session:
            db_user = dbapi.get_user_uuid(db_session, UUID(user_id))
            return dbapi.get_user_by_username(db_session, db_user.username)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"User with ID {user_id} not found in DB",
        ) from exc
