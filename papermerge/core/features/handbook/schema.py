import uuid
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class HandbookArticleOut(BaseModel):
    id: uuid.UUID
    title: str
    body: str
    author_id: UUID | None = None
    author_username: str = ""
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HandbookArticleCreateIn(BaseModel):
    title: str = Field(..., max_length=500)
    body: str = Field(default="", max_length=200_000)

    @field_validator("title")
    @classmethod
    def title_strip_non_empty(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("title must not be empty")
        return s


class HandbookArticleUpdateIn(BaseModel):
    title: str | None = Field(None, max_length=500)
    body: str | None = Field(None, max_length=200_000)

    @field_validator("title")
    @classmethod
    def title_strip_non_empty(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        if not s:
            raise ValueError("title must not be empty")
        return s


class HandbookAssetOut(BaseModel):
    id: uuid.UUID
    article_id: UUID
    filename: str
    content_type: str
    size_bytes: int
    url: str

    model_config = ConfigDict(from_attributes=True)
