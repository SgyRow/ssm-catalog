from passlib.hash import pbkdf2_sha256

from auth_server.auth import verify_password


def test_verify_password():
    password = "123"
    hashed_password = pbkdf2_sha256.hash("123")
    assert verify_password(password, hashed_password)
