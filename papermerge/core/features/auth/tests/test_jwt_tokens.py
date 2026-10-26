"""Unit tests for JWT verification helpers."""

from papermerge.core import config
from papermerge.core.features.auth.jwt_tokens import sign_access_token, verify_access_token


def test_verify_access_token_accepts_signed_token():
    config.settings.papermerge__security__secret_key = "unit-test-secret"
    config.settings.papermerge__security__token_algorithm = "HS256"

    token = sign_access_token(
        {
            "sub": "user-1",
            "preferred_username": "alice",
            "email": "alice@example.com",
            "scopes": ["node.view"],
        }
    )

    claims = verify_access_token(token)
    assert claims is not None
    assert claims["preferred_username"] == "alice"
    assert claims["scopes"] == ["node.view"]


def test_verify_access_token_rejects_forged_signature():
    config.settings.papermerge__security__secret_key = "unit-test-secret"
    config.settings.papermerge__security__token_algorithm = "HS256"

    token = sign_access_token({"sub": "user-1", "preferred_username": "alice"})
    forged = token[:-3] + "xxx"

    assert verify_access_token(forged) is None
