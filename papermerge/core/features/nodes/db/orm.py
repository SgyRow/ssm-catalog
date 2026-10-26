import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy import ForeignKey, Integer, String, func, CheckConstraint, Index, text
from sqlalchemy.orm import Mapped, mapped_column, relationship, deferred

from papermerge.core import constants as const
from papermerge.core.features.users.db.orm import User
from papermerge.core.db.base import Base
from papermerge.core.types import CType


class Node(Base):
    __tablename__ = "nodes"

    id: Mapped[UUID] = mapped_column(primary_key=True, insert_default=uuid.uuid4())
    title: Mapped[str] = mapped_column(String(const.NODE_TITLE_MAX_LENGTH))
    ctype: Mapped[CType]
    lang: Mapped[str] = mapped_column(String(8), default="deu")
    user: Mapped["User"] = relationship(
        back_populates="nodes",
        primaryjoin="User.id == Node.user_id",
        remote_side=User.id,
        cascade="delete"
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey(
            "users.id",
            use_alter=True,
            name="nodes_user_id_fkey",
            ondelete="CASCADE",
            deferrable=True
        ),
        nullable=True,
    )
    group: Mapped["Group"] = relationship(
        back_populates="nodes",
        primaryjoin="Group.id == Node.group_id",
        remote_side="Group.id",
        cascade="delete",
    )
    group_id: Mapped[UUID] = mapped_column(
        ForeignKey(
            "groups.id",
            use_alter=True,
            name="nodes_group_id_fkey",
            ondelete="CASCADE",
        ),
        nullable=True,
    )
    parent_id: Mapped[UUID] = mapped_column(ForeignKey("nodes.id"), nullable=True)
    sort_index: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    tags: Mapped[list["Tag"]] = relationship(secondary="nodes_tags", lazy="selectin")
    created_at: Mapped[datetime] = mapped_column(insert_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        insert_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(nullable=True)

    __mapper_args__ = {
        "polymorphic_identity": "node",
        "polymorphic_on": "ctype",
        "confirm_deleted_rows": False,
    }

    __table_args__ = (
        Index(
            "unique_title_per_parent_per_user_active",
            "parent_id",
            "title",
            "user_id",
            unique=True,
            postgresql_where=text("deleted_at IS NULL AND user_id IS NOT NULL"),
            sqlite_where=text("deleted_at IS NULL AND user_id IS NOT NULL"),
        ),
        Index(
            "unique_title_per_parent_per_group_active",
            "parent_id",
            "title",
            "group_id",
            unique=True,
            postgresql_where=text("deleted_at IS NULL AND group_id IS NOT NULL"),
            sqlite_where=text("deleted_at IS NULL AND group_id IS NOT NULL"),
        ),
        CheckConstraint(
            "user_id IS NOT NULL OR group_id IS NOT NULL",
            name="check__user_id_not_null__or__group_id_not_null",
        ),
        Index("ix_nodes_parent_id_sort_index", "parent_id", "sort_index"),
    )

    def __repr__(self):
        return f"{self.__class__.__name__}({self.title!r})"


class Folder(Node):
    __tablename__ = "folders"

    id: Mapped[UUID] = mapped_column(
        "node_id",
        ForeignKey("nodes.id", ondelete="CASCADE"),
        primary_key=True,
        insert_default=uuid.uuid4,
    )

    __mapper_args__ = {
        "polymorphic_identity": "folder",
    }
