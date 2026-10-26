import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from papermerge.core.db.base import Base


class UserFavorite(Base):
    __tablename__ = "user_favorites"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    node_id: Mapped[UUID] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(insert_default=func.now())


class UserRecentDocument(Base):
    __tablename__ = "user_recent_documents"

    id: Mapped[UUID] = mapped_column(primary_key=True, insert_default=uuid.uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    node_id: Mapped[UUID] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"))
    viewed_at: Mapped[datetime] = mapped_column(insert_default=func.now())


class AuditLogEntry(Base):
    __tablename__ = "audit_log_entries"

    id: Mapped[UUID] = mapped_column(primary_key=True, insert_default=uuid.uuid4)
    user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(64))
    resource_type: Mapped[str] = mapped_column(String(64))
    resource_id: Mapped[UUID | None] = mapped_column(nullable=True)
    detail: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(insert_default=func.now())


class DocumentNote(Base):
    __tablename__ = "document_notes"

    id: Mapped[UUID] = mapped_column(primary_key=True, insert_default=uuid.uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    document_id: Mapped[UUID] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"))
    body: Mapped[str] = mapped_column(String(8000))
    created_at: Mapped[datetime] = mapped_column(insert_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        insert_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("user_id", "document_id", name="uq_note_per_user_doc"),
    )


class DocumentComment(Base):
    __tablename__ = "document_comments"

    id: Mapped[UUID] = mapped_column(primary_key=True, insert_default=uuid.uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    document_id: Mapped[UUID] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"))
    body: Mapped[str] = mapped_column(String(8000))
    created_at: Mapped[datetime] = mapped_column(insert_default=func.now())


class DocumentRating(Base):
    __tablename__ = "document_ratings"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    document_id: Mapped[UUID] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"), primary_key=True)
    score: Mapped[int] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(insert_default=func.now())

    __table_args__ = (CheckConstraint("score >= 1 AND score <= 5", name="ck_rating_score_1_5"),)


class DocumentFullVersionAttachment(Base):
    """Full-version document links shown in the About file panel."""

    __tablename__ = "document_full_version_attachments"

    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    node_id: Mapped[UUID] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class DocumentCounter(Base):
    __tablename__ = "document_counters"

    document_id: Mapped[UUID] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"), primary_key=True)
    view_count: Mapped[int] = mapped_column(insert_default=0)
    download_count: Mapped[int] = mapped_column(insert_default=0)


class UserNotification(Base):
    __tablename__ = "user_notifications"

    id: Mapped[UUID] = mapped_column(primary_key=True, insert_default=uuid.uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(64))
    payload: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(insert_default=func.now())


class SearchQueryLog(Base):
    __tablename__ = "search_query_logs"

    id: Mapped[UUID] = mapped_column(primary_key=True, insert_default=uuid.uuid4)
    user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    query_text: Mapped[str] = mapped_column(String(2000))
    created_at: Mapped[datetime] = mapped_column(insert_default=func.now())
