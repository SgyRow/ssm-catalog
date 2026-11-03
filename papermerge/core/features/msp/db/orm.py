import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from papermerge.core.db.base import Base


class MspType(Base):
    """A measure type (вид МСП) — e.g. ЕДК, ЕДВ, Компенсации.

    A type defines the set of sections (blocks) that instances of this type
    will have. The set is dynamic: an administrator picks how many sections
    to create and names them freely.
    """

    __tablename__ = "msp_types"

    id: Mapped[UUID] = mapped_column(primary_key=True, insert_default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(300), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), insert_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), insert_default=func.now(), onupdate=func.now(), nullable=False
    )

    sections: Mapped[list["MspTypeSection"]] = relationship(
        back_populates="msp_type",
        order_by="MspTypeSection.sort_order",
        lazy="selectin",
        cascade="all, delete-orphan",
    )


class MspTypeSection(Base):
    """A single block (section) defined inside a measure type."""

    __tablename__ = "msp_type_sections"

    id: Mapped[UUID] = mapped_column(primary_key=True, insert_default=uuid.uuid4)
    msp_type_id: Mapped[UUID] = mapped_column(
        ForeignKey("msp_types.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), insert_default=func.now(), nullable=False
    )

    msp_type: Mapped["MspType"] = relationship(back_populates="sections")


class Msp(Base):
    """A concrete measure (мера) — an instance of a measure type.

    The measure is anchored to a folder node in the node tree so it keeps
    appearing in the portal catalog / breadcrumbs / search just like a folder.
    The actual content lives in the database (see :class:`MspSection`), not as
    child document nodes.
    """

    __tablename__ = "msps"

    id: Mapped[UUID] = mapped_column(primary_key=True, insert_default=uuid.uuid4)
    node_id: Mapped[UUID] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    msp_type_id: Mapped[UUID] = mapped_column(
        ForeignKey("msp_types.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), insert_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), insert_default=func.now(), onupdate=func.now(), nullable=False
    )

    msp_type: Mapped["MspType"] = relationship(lazy="selectin")
    sections: Mapped[list["MspSection"]] = relationship(
        back_populates="msp",
        order_by="MspSection.sort_order",
        lazy="selectin",
        cascade="all, delete-orphan",
    )


class MspSection(Base):
    """Filled-in section of a concrete measure.

    Only sections whose text is non-empty are stored, so empty sections are
    simply "not needed" and are never rendered.
    """

    __tablename__ = "msp_sections"

    id: Mapped[UUID] = mapped_column(primary_key=True, insert_default=uuid.uuid4)
    msp_id: Mapped[UUID] = mapped_column(
        ForeignKey("msps.id", ondelete="CASCADE"), nullable=False
    )
    # Links back to the type section this value came from (best-effort; may be
    # NULL if the type section was removed after the measure was created).
    type_section_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("msp_type_sections.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str | None] = mapped_column(Text(), nullable=True)
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    msp: Mapped["Msp"] = relationship(back_populates="sections")
