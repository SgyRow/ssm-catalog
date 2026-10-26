import logging

import httpx
import pytest

from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

from auth_server.db.engine import Session
from auth_server.db.base import Base
from auth_server.main import app
from auth_server.db.engine import engine


logger = logging.getLogger(__name__)


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(engine, checkfirst=False)
    with Session() as session:
        try:
            yield session
        finally:
            session.rollback()  # Ensure any uncommitted changes are rolled back

    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
        conn.commit()


@pytest.fixture()
def client() -> httpx.Client:
    return TestClient(app)


@pytest.fixture()
def db_engine() -> Engine:
    return engine
