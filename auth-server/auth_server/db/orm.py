import uuid
from datetime import datetime
from typing import List, Literal
from uuid import UUID

from sqlalchemy import ForeignKey, String, func, Column, Table
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base

HOME_TITLE = "home"
INBOX_TITLE = "inbox"


roles_permissions_association = Table(
    "roles_permissions",
    Base.metadata,
    Column(
        "role_id",
        ForeignKey("roles.id"),
    ),
    Column(
        "permission_id",
        ForeignKey("permissions.id"),
    ),
)

user_groups_association = Table(
    "users_groups",
    Base.metadata,
    Column(
        "user_id",
        ForeignKey("users.id"),
    ),
    Column(
        "group_id",
        ForeignKey("groups.id"),
    ),
)

users_roles_association = Table(
    "users_roles",
    Base.metadata,
    Column(
        "role_id",
        ForeignKey("roles.id"),
    ),
    Column(
        "user_id",
        ForeignKey("users.id"),
    ),
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True, insert_default=uuid.uuid4())
    username: Mapped[str]
    email: Mapped[str]
    password: Mapped[str]
    first_name: Mapped[str] = mapped_column(default=" ")
    last_name: Mapped[str] = mapped_column(default=" ")
    is_superuser: Mapped[bool] = mapped_column(default=False)
    is_staff: Mapped[bool] = mapped_column(default=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    nodes: Mapped[List["Node"]] = relationship(
        back_populates="user", primaryjoin="User.id == Node.user_id"
    )
    home_folder_id: Mapped[UUID] = mapped_column(
        ForeignKey("folders.node_id", deferrable=True, ondelete="CASCADE"),
        nullable=True,
    )
    home_folder: Mapped["Folder"] = relationship(
        primaryjoin="User.home_folder_id == Folder.id",
        back_populates="user",
        viewonly=True,
        cascade="delete",
    )
    inbox_folder_id: Mapped[UUID] = mapped_column(
        ForeignKey("folders.node_id", deferrable=True, ondelete="CASCADE"),
        nullable=True,
    )
    inbox_folder: Mapped["Folder"] = relationship(
        primaryjoin="User.home_folder_id == Folder.id",
        back_populates="user",
        viewonly=True,
        cascade="delete",
    )
    created_at: Mapped[datetime] = mapped_column(insert_default=func.now())
    date_joined: Mapped[datetime] = mapped_column(insert_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        insert_default=func.now(), onupdate=func.now()
    )
    roles: Mapped[list["Role"]] = relationship(  # noqa: F821
        secondary=users_roles_association, back_populates="users"
    )
    groups: Mapped[list["Group"]] = relationship(
        secondary=user_groups_association, back_populates="users"
    )

    __mapper_args__ = {"confirm_deleted_rows": False}


CType = Literal["document", "folder"]


class Node(Base):
    __tablename__ = "nodes"

    id: Mapped[UUID] = mapped_column(primary_key=True, insert_default=uuid.uuid4())
    title: Mapped[str] = mapped_column(String(200))
    ctype: Mapped[CType]
    lang: Mapped[str] = mapped_column(String(8))
    tags: List[str] = []
    user: Mapped["User"] = relationship(
        back_populates="nodes", primaryjoin="User.id == Node.user_id"
    )
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", use_alter=True))
    parent_id: Mapped[UUID] = mapped_column(ForeignKey("nodes.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(insert_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        insert_default=func.now(), onupdate=func.now()
    )

    __mapper_args__ = {
        "polymorphic_identity": "node",
        "polymorphic_on": "ctype",
    }

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


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str]
    codename: Mapped[str]
    roles = relationship(
        "Role", secondary=roles_permissions_association, back_populates="permissions"
    )


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str]
    users: Mapped[list["User"]] = relationship(
        secondary=user_groups_association, back_populates="groups"
    )


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(unique=True)
    permissions: Mapped[list["Permission"]] = relationship(
        secondary=roles_permissions_association, back_populates="roles"
    )
    users: Mapped[list["User"]] = relationship(  # noqa: F821
        secondary=users_roles_association, back_populates="roles"
    )
