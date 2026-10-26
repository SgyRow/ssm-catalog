from fastapi import Request, FastAPI
from fastapi.security.utils import get_authorization_scheme_param

from .config import Settings

app = FastAPI()
settings = Settings()


def raise_on_empty(**kwargs):
    """Raises ValueError exception if at least one value of the
    key in kwargs dictionary is None
    """
    for key, value in kwargs.items():
        if value is None:
            raise ValueError(
                 f"{key} is expected to be non-empty"
            )


def from_header(request: Request) -> str | None:
    authorization = request.headers.get("Authorization")
    scheme, token = get_authorization_scheme_param(authorization)

    if not authorization or scheme.lower() != "bearer":
        return None

    return token


def from_cookie(request: Request) -> str | None:
    cookie_name = settings.papermerge__security__cookie_name
    return request.cookies.get(cookie_name, None)


def get_token(request: Request) -> str | None:
    return from_cookie(request) or from_header(request)
