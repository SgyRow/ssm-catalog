import pytest
from sqlalchemy.orm import Session

from auth_server.db import api as dbapi
from auth_server.db.orm import User


def test_register_user_creates_account_with_employee_role(
    client, db_session: Session
):
    dbapi.sync_perms(db_session)
    dbapi.create_role(
        db_session,
        name="employee",
        scopes=["node.view", "document.download", "user.me"],
    )

    response = client.post(
        "/register",
        json={
            "username": "newuser",
            "password": "secret123",
            "password_confirm": "secret123",
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["access_token"] is not None

    user = dbapi.get_user_by_username(db_session, "newuser")
    assert user.username == "newuser"
    assert user.is_superuser is False
    assert set(user.scopes) == {"node.view", "document.download", "user.me"}

    db_user = db_session.get(User, user.id)
    assert db_user is not None
    assert len(db_user.groups) == 0
    assert len(db_user.roles) == 1
    assert db_user.roles[0].name == "employee"


def test_register_rejects_password_mismatch(client):
    response = client.post(
        "/register",
        json={
            "username": "mismatch",
            "password": "secret123",
            "password_confirm": "other",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Passwords do not match"


def test_register_rejects_duplicate_username(client, db_session: Session):
    dbapi.create_user(
        db_session,
        username="taken",
        email="taken@mail.com",
        password="secret",
        is_superuser=False,
    )

    response = client.post(
        "/register",
        json={
            "username": "taken",
            "password": "secret123",
            "password_confirm": "secret123",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Username already taken"


def test_register_profile_updates_name_and_email(client, db_session: Session):
    register_response = client.post(
        "/register",
        json={
            "username": "profileuser",
            "password": "secret123",
            "password_confirm": "secret123",
        },
    )
    assert register_response.status_code == 200, register_response.text
    token = register_response.json()["access_token"]

    profile_response = client.patch(
        "/register/profile",
        json={"first_name": "Ivan", "last_name": "Petrov", "email": "ivan@mail.com"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert profile_response.status_code == 200, profile_response.text

    user = dbapi.get_user_by_username(db_session, "profileuser")
    assert user.email == "ivan@mail.com"

    db_user = db_session.get(User, user.id)
    assert db_user.first_name == "Ivan"
    assert db_user.last_name == "Petrov"


def test_register_profile_rejects_duplicate_email(client, db_session: Session):
    dbapi.create_user(
        db_session,
        username="existing",
        email="busy@mail.com",
        password="secret",
        is_superuser=False,
    )

    register_response = client.post(
        "/register",
        json={
            "username": "another",
            "password": "secret123",
            "password_confirm": "secret123",
        },
    )
    token = register_response.json()["access_token"]

    profile_response = client.patch(
        "/register/profile",
        json={"first_name": "Petr", "last_name": "Sidorov", "email": "busy@mail.com"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert profile_response.status_code == 400
    assert profile_response.json()["detail"] == "Email already in use"
