from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class FeedbackMessageCreateIn(BaseModel):
    body: str = Field(..., max_length=20000)

    @field_validator("body")
    @classmethod
    def body_strip(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("body must not be empty")
        return s


class FeedbackMessageOut(BaseModel):
    id: UUID
    body: str
    from_staff: bool
    author_name: str
    created_at: datetime


class FeedbackMyThreadOut(BaseModel):
    id: UUID | None = None
    unread: int = 0
    messages: list[FeedbackMessageOut] = Field(default_factory=list)


class FeedbackThreadOut(BaseModel):
    id: UUID
    user_id: UUID
    username: str
    last_preview: str
    last_message_at: datetime
    unread_for_staff: int


class FeedbackThreadDetailOut(BaseModel):
    id: UUID
    user_id: UUID
    username: str
    unread_for_staff: int
    messages: list[FeedbackMessageOut] = Field(default_factory=list)


class FeedbackUnreadOut(BaseModel):
    mine: int = 0
    inbox: int = 0


class FeedbackWishCreateIn(BaseModel):
    subject: str = Field(..., max_length=500)
    body: str = Field(..., max_length=20000)

    @field_validator("subject", "body")
    @classmethod
    def strip_required(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("must not be empty")
        return s


class FeedbackWishOut(BaseModel):
    id: UUID
    subject: str
    body: str
    author_name: str
    created_at: datetime
    read_at: datetime | None = None
