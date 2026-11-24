import hashlib
import logging

from sqlalchemy.orm import Session
from sqlalchemy.exc import NoResultFound

from datetime import datetime, timedelta, UTC
import jwt
from passlib.hash import pbkdf2_sha256

from fastapi import HTTPException

from auth_server.db import api as dbapi
from auth_server.db.orm import User
from auth_server import schema
from auth_server.config import Settings
from auth_server.backends import OIDCAuth, ldap
from auth_server.utils import raise_on_empty


logger = logging.getLogger(__name__)
settings = Settings()

# Short claim embedded in the JWT. Must match papermerge.core.features.auth.jwt_tokens.
PASSWORD_STAMP_CLAIM = "pv"
SESSION_VERSION_CLAIM = "sv"


def password_stamp(password_hash: str) -> str:
    """Fingerprint of the stored password hash.

    Changing the password changes the hash, so previously issued tokens stop
    verifying. The hash itself is not put in the token.
    """
    return hashlib.sha256(password_hash.encode("utf-8")).hexdigest()[:16]


def token_matches_password(claims: dict, password_hash: str | None) -> bool:
    """Tokens without a stamp are legacy (they still carry exp)."""
    stamp = claims.get(PASSWORD_STAMP_CLAIM)
    if not stamp:
        return True
    if not password_hash:
        return False
    return stamp == password_stamp(password_hash)


def token_matches_session(claims: dict, session_version: int | None) -> bool:
    """Tokens without sv were issued before logout invalidation existed."""
    if SESSION_VERSION_CLAIM not in claims or claims.get(SESSION_VERSION_CLAIM) is None:
        return True
    try:
        return int(claims[SESSION_VERSION_CLAIM]) == int(session_version or 0)
    except (TypeError, ValueError):
        return False


async def authenticate(
    session: Session,
    *,
    username: str | None = None,
    password: str | None = None,
    provider: schema.AuthProvider = schema.AuthProvider.DB,
    client_id: str | None = None,
    code: str | None = None,
    redirect_url: str | None = None,
) -> schema.User | str | None:

    # provider = DB
    if username and password and provider == schema.AuthProvider.DB:
        # password based authentication against database
        return db_auth(session, username, password)

    if provider == schema.AuthProvider.OIDC:
        raise_on_empty(
            code=code, client_id=client_id, provider=provider, redirect_url=redirect_url
        )
        return await oidc_auth(
            session, client_id=client_id, code=code, redirect_url=redirect_url
        )
    elif provider == schema.AuthProvider.LDAP:
        # provider = ldap
        return await ldap_auth(session, username, password)
    else:
        raise ValueError("Unknown or empty auth provider")


def verify_password(password: str, hashed_password: str) -> bool:
    logger.debug("checking credentials...")
    return pbkdf2_sha256.verify(password, hashed_password)


def create_access_token(
    data: schema.TokenData,
    secret_key: str,
    algorithm: str,
    expires_delta: timedelta | None = None,
) -> str:
    logger.debug(f"create access token for data={data}")

    to_encode = data.model_dump()
    # No expires_delta means the token does not expire by time. Logout and a
    # password change are the only ways a session ends.
    if expires_delta is not None:
        to_encode["exp"] = datetime.now(UTC) + expires_delta

    try:
        encoded_jwt = jwt.encode(to_encode, secret_key, algorithm=algorithm)
    except Exception as exc:
        logger.error(exc)
        raise

    return encoded_jwt


def db_auth(session: Session, username: str, password: str) -> schema.User | None:
    """Authenticates user based on username and password

    User data is read from database.
    """
    logger.info(f"Database based authentication for '{username}'")

    try:
        user: schema.User | None = dbapi.get_user_by_username(session, username)
    except NoResultFound:
        user = None

    if not user:
        logger.warning(f"User {username} not found in database")
        return None

    if not verify_password(password, user.password):
        logger.warning(f"Authentication failed for '{username}'")
        return None

    logger.info(f"Authentication succeded for '{username}'")
    return user


async def ldap_auth(
    session: Session, username: str, password: str
) -> schema.User | None:
    client = ldap.get_client(username, password)

    try:
        await client.signin()
    except Exception as ex:
        logger.warning(f"Auth:LDAP: sign in failed with {ex}")

        raise HTTPException(
            status_code=401, detail=f"401 Unauthorized. LDAP Auth error: {ex}."
        )

    email = ldap.get_default_email(username)
    try:
        email = await client.user_email()
    except Exception as ex:
        logger.warning(f"Auth:LDAP: cannot retrieve user email {ex}")
        logger.warning(f"Auth:LDAP: user email fallback to {email}")

    return dbapi.get_or_create_user_by_email(session, email)


async def oidc_auth(
    session: Session, client_id: str, code: str, redirect_url: str
) -> str | None:
    if settings.papermerge__auth__oidc_client_secret is None:
        raise HTTPException(status_code=400, detail="OIDC client secret is empty")

    client = OIDCAuth(
        client_secret=settings.papermerge__auth__oidc_client_secret,
        access_token_url=settings.papermerge__auth__oidc_access_token_url,
        user_info_url=settings.papermerge__auth__oidc_user_info_url,
        client_id=client_id,
        code=code,
        redirect_url=redirect_url,
    )

    logger.debug("Auth:oidc: sign in")

    try:
        result = await client.signin()
    except Exception as ex:
        logger.warning(f"Auth:oidc: sign in failed with {ex}")

        raise HTTPException(
            status_code=401, detail=f"401 Unauthorized. Auth provider error: {ex}."
        )

    return result


def create_token(user: schema.User) -> str:
    data = schema.TokenData(
        sub=str(user.id),
        preferred_username=user.username,
        email=user.email,
        scopes=user.scopes,
    )
    to_encode = data.model_dump()
    to_encode[PASSWORD_STAMP_CLAIM] = password_stamp(user.password)
    to_encode[SESSION_VERSION_CLAIM] = int(user.session_version or 0)

    try:
        encoded_jwt = jwt.encode(
            to_encode,
            settings.papermerge__security__secret_key,
            algorithm=settings.papermerge__security__token_algorithm,
        )
    except Exception as exc:
        logger.error(exc)
        raise

    return encoded_jwt
