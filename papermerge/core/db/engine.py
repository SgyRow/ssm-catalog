import logging
import os

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from papermerge.core.config import get_settings

connect_args = {}
logger = logging.getLogger(__name__)


def resolve_database_url() -> str:
    """Database URL for SQLAlchemy (env var wins, then `.env` via settings)."""
    env_url = os.environ.get("PAPERMERGE__DATABASE__URL")
    if env_url:
        return env_url
    return get_settings().papermerge__database__url


def _async_database_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)

    # Async engine requires async drivers. Plain sqlite:// uses pysqlite (sync).
    if url.startswith("sqlite+pysqlite://"):
        return "sqlite+aiosqlite://" + url[len("sqlite+pysqlite://") :]
    if url.startswith("sqlite://") and not url.startswith("sqlite+aiosqlite://"):
        return "sqlite+aiosqlite://" + url[len("sqlite://") :]
    return url


SQLALCHEMY_DATABASE_URL = _async_database_url(resolve_database_url())

is_postgres = SQLALCHEMY_DATABASE_URL.startswith("postgresql+asyncpg://")
if is_postgres:
    # Keep TIMESTAMP WITHOUT TIME ZONE writes in UTC even when the container
    # TZ is Asia/Vladivostok (asyncpg otherwise inherits a local session TZ).
    connect_args = {"server_settings": {"timezone": "UTC"}}
    pool_size = int(os.environ.get("PAPERMERGE__DATABASE__POOL_SIZE", "20"))
    max_overflow = int(os.environ.get("PAPERMERGE__DATABASE__MAX_OVERFLOW", "40"))
    pool_timeout = int(os.environ.get("PAPERMERGE__DATABASE__POOL_TIMEOUT", "30"))
    pool_recycle = int(os.environ.get("PAPERMERGE__DATABASE__POOL_RECYCLE", "1800"))
    engine = create_async_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args=connect_args,
        pool_pre_ping=True,
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_timeout=pool_timeout,
        pool_recycle=pool_recycle,
    )
else:
    engine = create_async_engine(SQLALCHEMY_DATABASE_URL, connect_args=connect_args)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


def get_engine():
    return engine
