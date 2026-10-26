import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from papermerge.core.db.base import Base

from papermerge.core.features.portal.constants import PORTAL_SETTINGS_ROW_ID


class PortalNews(Base):
    """Editorial news posts for the legal portal feed."""

    __tablename__ = "portal_news"

    id: Mapped[UUID] = mapped_column(primary_key=True, insert_default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[str] = mapped_column(Text(), nullable=False, default="")
    author_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        insert_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        insert_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class PortalNewsAttachment(Base):
    """Document nodes linked to a portal news post (portal catalog only)."""

    __tablename__ = "portal_news_attachments"

    news_id: Mapped[UUID] = mapped_column(
        ForeignKey("portal_news.id", ondelete="CASCADE"),
        primary_key=True,
    )
    node_id: Mapped[UUID] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class PortalSettings(Base):
    """Single-row settings: root folder for the legal portal tree."""

    __tablename__ = "portal_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=PORTAL_SETTINGS_ROW_ID)
    portal_root_node_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("nodes.id", ondelete="SET NULL"),
        nullable=True,
    )
    portal_group_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("groups.id", ondelete="SET NULL"),
        nullable=True,
    )
