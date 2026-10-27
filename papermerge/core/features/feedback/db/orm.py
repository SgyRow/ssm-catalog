import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from papermerge.core.db.base import Base


class FeedbackThread(Base):
    __tablename__ = "feedback_threads"

    id: Mapped[UUID] = mapped_column(primary_key=True, insert_default=uuid.uuid4)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    last_message_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        insert_default=func.now(),
        nullable=False,
    )
    last_preview: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    unread_for_staff: Mapped[int] = mapped_column(
        Integer(), nullable=False, default=0
    )
    unread_for_user: Mapped[int] = mapped_column(
        Integer(), nullable=False, default=0
    )


class FeedbackWish(Base):
    __tablename__ = "feedback_wishes"

    id: Mapped[UUID] = mapped_column(primary_key=True, insert_default=uuid.uuid4)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[str] = mapped_column(Text(), nullable=False)
    author_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        insert_default=func.now(),
        nullable=False,
    )
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class FeedbackMessage(Base):
    __tablename__ = "feedback_messages"

    id: Mapped[UUID] = mapped_column(primary_key=True, insert_default=uuid.uuid4)
    thread_id: Mapped[UUID] = mapped_column(
        ForeignKey("feedback_threads.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    body: Mapped[str] = mapped_column(Text(), nullable=False)
    from_staff: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        insert_default=func.now(),
        nullable=False,
    )
