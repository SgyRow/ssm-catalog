import enum
import uuid
from uuid import UUID

from sqlalchemy import Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from papermerge.core.db.base import Base


class NodeAccessLevel(str, enum.Enum):
    private = "private"
    role_based = "role_based"
    public = "public"


class NodeVisibility(Base):
    """Explicit visibility override for a node. Absence = inherit from parent."""

    __tablename__ = "node_visibility"

    node_id: Mapped[UUID] = mapped_column(
        ForeignKey(
            "nodes.id",
            use_alter=True,
            name="node_visibility_node_id_fkey",
            ondelete="CASCADE",
        ),
        primary_key=True,
    )
    access_level: Mapped[NodeAccessLevel] = mapped_column(
        Enum(NodeAccessLevel, name="node_access_level", native_enum=True),
        nullable=False,
    )


class NodeVisibilityRole(Base):
    __tablename__ = "node_visibility_roles"

    node_id: Mapped[UUID] = mapped_column(
        ForeignKey(
            "nodes.id",
            use_alter=True,
            name="node_visibility_roles_node_id_fkey",
            ondelete="CASCADE",
        ),
        primary_key=True,
    )
    role_id: Mapped[UUID] = mapped_column(
        ForeignKey(
            "roles.id",
            use_alter=True,
            name="node_visibility_roles_role_id_fkey",
            ondelete="CASCADE",
        ),
        primary_key=True,
    )
