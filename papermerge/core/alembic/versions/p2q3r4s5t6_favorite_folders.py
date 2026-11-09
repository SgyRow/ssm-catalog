"""user favorite folders and folder_id on user_favorites

Revision ID: p2q3r4s5t6
Revises: o1p2q3r4s5t6
Create Date: 2026-11-09

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "p2q3r4s5t6"
down_revision: str | Sequence[str] | None = "o1p2q3r4s5t6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_favorite_folders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("sort_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="user_favorite_folders_pkey"),
        sa.UniqueConstraint("user_id", "title", name="uq_user_favorite_folder_title"),
    )
    op.create_index(
        "ix_user_favorite_folders_user_id",
        "user_favorite_folders",
        ["user_id"],
    )
    op.add_column(
        "user_favorites",
        sa.Column("folder_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "user_favorites_folder_id_fkey",
        "user_favorites",
        "user_favorite_folders",
        ["folder_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_user_favorites_folder_id", "user_favorites", ["folder_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_user_favorites_folder_id", table_name="user_favorites")
    op.drop_constraint(
        "user_favorites_folder_id_fkey", "user_favorites", type_="foreignkey"
    )
    op.drop_column("user_favorites", "folder_id")
    op.drop_index(
        "ix_user_favorite_folders_user_id", table_name="user_favorite_folders"
    )
    op.drop_table("user_favorite_folders")
