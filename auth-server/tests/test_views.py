import logging
from unittest import mock
import httpx
import pytest

from sqlalchemy.orm import Session

from auth_server.main import settings
from auth_server.db import api as dbapi

logger = logging.getLogger(__name__)


class MockedGoogleAuth:
    def __init__(self, *args, **kwargs):
        pass

    async def signin(self):
        pass

    async def user_email(self):
        return "momo@mail.com"


@pytest.mark.skip()
def test_retrieve_token_endpoint(client: httpx.Client):
    """
    Basic test using Google Auth
    """
    settings.papermerge__auth__google_client_secret = "123"
    logger.debug("===TEST SOCIAL TOKEN===")
    with mock.patch("auth_server.auth.GoogleAuth", MockedGoogleAuth):
        response = client.post(
            "/token",
            params={
                "provider": "google",
                "client_id": "123",
                "code": "abc",
                "redirect_uri": "http://site.com/callback",
            },
        )

        assert response.status_code == 200, response.text
        assert response.json()["access_token"] is not None


def test_invalid_post_request(client: httpx.Client):
    """
    POST request to /token must have either non-empty request body
    containing user credentials or provide following request parameters
    for oauth2:
    - provider
    - code
    - client_id
    - redirect_uri
    """
    # both params and body are empty
    response = client.post("/token", params={})
    # should return 400 Bad request as both body and params
    # are empty
    assert response.status_code == 400, response.text

    response = client.post(
        "/token",
        params={
            "code": "123",
            "redirect_uri": "http://some/callback",
            "provider": "oidc",
        },
    )
    # should return 400 Bad request as "client_id" parameter is missing
    assert response.status_code == 400, response.text

    response = client.post(
        "/token",
        params={
            "client_id": "cl123",
            "redirect_uri": "http://some/callback",
            "provider": "oidc",
        },
    )
    # should return 400 Bad request as "code" parameter is missing
    assert response.status_code == 400, response.text

    response = client.post(
        "/token",
        params={
            "client_id": "cl123",
            "redirect_uri": "http://some/callback",
            "code": "abc",
        },
    )
    # should return 400 Bad request as "provider" parameter is missing
    assert response.status_code == 400, response.text

    response = client.post(
        "/token", params={"client_id": "cl123", "provider": "oidc", "code": "abc"}
    )
    # should return 400 Bad request as "redirect_uri" parameter is missing
    assert response.status_code == 400, response.text


def test_db_based_authentication_for_existing_user(
    client: httpx.Client, db_session: Session
):
    """
    Validate that DB based authentication can be performed
    """
    # create user "socrates"
    dbapi.create_user(
        db_session, username="socrates", email="socrates@mail.com", password="secret"
    )

    # socrates enters wrong password
    response = client.post(
        "/token",
        json={
            "username": "socrates",
            "password": "wrongsecret",  # this is wrong password!
        },
    )

    assert response.status_code == 401

    # socrates enters correct credentials
    response = client.post(
        "/token", json={"username": "socrates", "password": "secret"}
    )

    assert response.status_code == 200, response.text
    # now socrates has its access token
    assert response.json()["access_token"] is not None


def test_db_based_authentication_for_non_existing_user(
    client: httpx.Client, db_session: Session
):
    # There is no user "kant" in DB
    response = client.post("/token", json={"username": "kant", "password": "secret"})

    assert response.status_code == 401, response.text
    assert response.json()["detail"] == "Unauthorized"
