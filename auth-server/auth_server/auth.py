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
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=15)
    to_encode.update({"exp": expire})

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
    access_token_expires = timedelta(
        minutes=settings.papermerge__security__token_expire_minutes
    )
    data = schema.TokenData(
        sub=str(user.id),
        preferred_username=user.username,
        email=user.email,
        scopes=user.scopes,
    )

    access_token = create_access_token(
        data=data,
        expires_delta=access_token_expires,
        secret_key=settings.papermerge__security__secret_key,
        algorithm=settings.papermerge__security__token_algorithm,
    )

    return access_token
