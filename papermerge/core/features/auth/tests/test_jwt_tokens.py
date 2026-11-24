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


def test_token_without_exp_stays_valid():
    config.settings.papermerge__security__secret_key = "unit-test-secret"
    config.settings.papermerge__security__token_algorithm = "HS256"

    token = sign_access_token({"sub": "user-1", "preferred_username": "alice"})
    claims = verify_access_token(token)

    assert claims is not None
    assert "exp" not in claims


def test_password_and_session_claims():
    from papermerge.core.features.auth.jwt_tokens import (
        password_stamp,
        token_matches_password,
        token_matches_session,
    )

    stamp = password_stamp("hash-a")
    assert token_matches_password({"pv": stamp}, "hash-a")
    assert not token_matches_password({"pv": stamp}, "hash-b")
    assert token_matches_password({}, "hash-a")
    assert token_matches_session({"sv": 2}, 2)
    assert not token_matches_session({"sv": 2}, 3)
    assert token_matches_session({}, 3)
