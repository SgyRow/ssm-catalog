from datetime import datetime
from urllib.parse import urlparse
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


def normalize_http_url(value: str) -> str:
    raw = (value or "").strip()
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("URL must start with http:// or https://")
    return raw


class ServiceOut(BaseModel):
    id: UUID
    title: str
    url: str
    logo_url: str | None = None
    slug: str | None = None
    builtin: bool = False
    sort_index: int = 0
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ServiceCreateIn(BaseModel):
    title: str = Field(..., max_length=200)
    url: str = Field(..., max_length=2000)
    logo_url: str | None = Field(None, max_length=2000)

    @field_validator("title")
    @classmethod
    def title_strip_non_empty(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("title must not be empty")
        return s

    @field_validator("url")
    @classmethod
    def url_http(cls, v: str) -> str:
        return normalize_http_url(v)

    @field_validator("logo_url")
    @classmethod
    def logo_http(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        if not s:
            return None
        return normalize_http_url(s)
