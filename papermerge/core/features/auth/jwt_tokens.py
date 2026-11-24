"""JWT helpers shared with auth-server (signature verification)."""

from __future__ import annotations

import hashlib
from typing import Any

from jose import JWTError, jwt

from papermerge.core.config import get_settings

# Must match auth_server.auth.PASSWORD_STAMP_CLAIM / password_stamp.
PASSWORD_STAMP_CLAIM = "pv"
SESSION_VERSION_CLAIM = "sv"


def password_stamp(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode("utf-8")).hexdigest()[:16]


def token_matches_password(claims: dict[str, Any], password_hash: str | None) -> bool:
    """Tokens issued before password stamps existed have no `pv` claim."""
    stamp = claims.get(PASSWORD_STAMP_CLAIM)
    if not stamp:
        return True
    if not password_hash:
        return False
    return stamp == password_stamp(password_hash)


def token_matches_session(claims: dict[str, Any], session_version: int | None) -> bool:
    """Tokens issued before logout invalidation have no `sv` claim."""
    if SESSION_VERSION_CLAIM not in claims or claims.get(SESSION_VERSION_CLAIM) is None:
        return True
    try:
        return int(claims[SESSION_VERSION_CLAIM]) == int(session_version or 0)
    except (TypeError, ValueError):
        return False


def sign_access_token(claims: dict[str, Any]) -> str:
    """Sign a JWT access token (tests and paper-cli helpers)."""
    settings = get_settings()
    secret = settings.papermerge__security__secret_key
    if not secret:
        raise ValueError("papermerge__security__secret_key is not configured")
    return jwt.encode(
        claims,
        secret,
        algorithm=settings.papermerge__security__token_algorithm,
    )


def verify_access_token(token: str) -> dict[str, Any] | None:
    """Return verified JWT claims, or None when the token is invalid."""
    if not token or token.count(".") != 2:
        return None

    settings = get_settings()
    secret = settings.papermerge__security__secret_key
    if not secret:
        return None

    try:
        return jwt.decode(
            token,
            secret,
            algorithms=[settings.papermerge__security__token_algorithm],
        )
    except JWTError:
        return None
