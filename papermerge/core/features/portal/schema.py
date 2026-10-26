import uuid
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class PortalRootOut(BaseModel):
    """Portal root folder id and title for navigation."""

    id: UUID
    title: str
    model_config = ConfigDict(from_attributes=True)


class PortalNewsAttachmentOut(BaseModel):
    node_id: UUID
    title: str
    ctype: str

    model_config = ConfigDict(from_attributes=True)


class PortalNewsOut(BaseModel):
    id: uuid.UUID
    title: str
    body: str
    created_at: datetime
    updated_at: datetime
    author_id: UUID | None = None
    author_username: str = ""
    attachments: list[PortalNewsAttachmentOut] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class PortalNewsCreateIn(BaseModel):
    title: str = Field(..., max_length=500)
    body: str = Field(default="", max_length=50000)
    attachment_node_ids: list[UUID] = Field(default_factory=list, max_length=30)

    @field_validator("title")
    @classmethod
    def title_strip_non_empty(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("title must not be empty")
        return s


class PortalNewsUpdateIn(BaseModel):
    title: str | None = Field(None, max_length=500)
    body: str | None = Field(None, max_length=50000)
    attachment_node_ids: list[UUID] | None = Field(None, max_length=30)

    @model_validator(mode="after")
    def at_least_one_field(self):
        if (
            self.title is None
            and self.body is None
            and self.attachment_node_ids is None
        ):
            raise ValueError(
                "at least one of title, body, attachment_node_ids is required"
            )
        return self

    @field_validator("title")
    @classmethod
    def title_strip_non_empty(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        if not s:
            raise ValueError("title must not be empty")
        return s
