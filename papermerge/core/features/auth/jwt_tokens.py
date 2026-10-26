"""JWT helpers shared with auth-server (signature verification)."""

from __future__ import annotations

from typing import Any

from jose import JWTError, jwt

from papermerge.core.config import get_settings


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
