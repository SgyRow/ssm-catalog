from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from papermerge.core import schema as core_schema


class FavoriteOut(BaseModel):
    node_id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FavoriteRowOut(BaseModel):
    node_id: UUID
    title: str
    ctype: str
    created_at: datetime
    in_trash: bool = False


class RecentOut(BaseModel):
    node_id: UUID
    viewed_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RecentRowOut(BaseModel):
    node_id: UUID
    title: str
    ctype: str
    viewed_at: datetime
    in_trash: bool = False


class NoteOut(BaseModel):
    id: UUID
    document_id: UUID
    body: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NoteCreate(BaseModel):
    body: str = Field(..., max_length=8000)


class CommentOut(BaseModel):
    id: UUID
    document_id: UUID
    user_id: UUID
    author: str
    body: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CommentCreate(BaseModel):
    body: str = Field(..., max_length=8000)


class CommentUpdate(BaseModel):
    body: str = Field(..., max_length=8000)


class RatingOut(BaseModel):
    user_id: UUID
    document_id: UUID
    score: int
    avg_score: float | None = None
    vote_count: int | None = None


class RatingCreate(BaseModel):
    score: int = Field(..., ge=1, le=5)


class NotificationOut(BaseModel):
    id: UUID
    kind: str
    payload: str | None
    read_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuditEntryOut(BaseModel):
    id: UUID
    user_id: UUID | None
    action: str
    resource_type: str
    resource_id: UUID | None
    detail: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TrashNodeOut(BaseModel):
    id: UUID
    title: str
    ctype: str
    deleted_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class PopularSearchItem(BaseModel):
    query: str
    count: int


class LibraryStatsOut(BaseModel):
    total_documents: int
    total_views: int
    total_downloads: int
    popular_search_queries: list[PopularSearchItem]


class TrashBatchIn(BaseModel):
    node_ids: list[UUID] = Field(min_length=1)


class SessionAuditIn(BaseModel):
    event: Literal["login", "logout"]


class MspTemplateCreateIn(BaseModel):
    parent_id: UUID
    title: str = Field(..., min_length=1, max_length=255)


class MspTemplateCreateOut(BaseModel):
    root: core_schema.Folder
    folder_count: int


class LibrarySettingsOut(BaseModel):
    trash_retention_days: int = Field(
        ...,
        ge=1,
        le=3650,
        description="Days trashed files are kept before automatic permanent deletion.",
    )


class LibrarySettingsUpdate(BaseModel):
    trash_retention_days: int = Field(..., ge=1, le=3650)


class FullVersionAttachmentOut(BaseModel):
    node_id: UUID
    title: str
    ctype: str


class FullVersionAttachmentsUpdate(BaseModel):
    node_ids: list[UUID] = Field(default_factory=list, max_length=30)
