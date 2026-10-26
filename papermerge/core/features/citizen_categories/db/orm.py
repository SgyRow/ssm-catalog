import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from papermerge.core.db.base import Base


class CitizenCategory(Base):
    """Citizen-facing folder category (категория граждан)."""

    __tablename__ = "citizen_categories"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
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


class CitizenCategoryFolder(Base):
    """Many-to-many: folders may belong to several citizen categories."""

    __tablename__ = "citizen_category_folders"

    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("citizen_categories.id", ondelete="CASCADE"),
        primary_key=True,
    )
    node_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"),
        primary_key=True,
    )

    __table_args__ = (
        UniqueConstraint("category_id", "node_id", name="uq_citizen_category_folder"),
    )
