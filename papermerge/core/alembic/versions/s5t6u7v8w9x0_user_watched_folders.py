"""user watched folders and folder_id on user_watched

Revision ID: s5t6u7v8w9x0
Revises: r4s5t6u7v8w9
Create Date: 2026-11-13

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "s5t6u7v8w9x0"
down_revision: str | Sequence[str] | None = "r4s5t6u7v8w9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_watched_folders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("sort_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="user_watched_folders_pkey"),
        sa.UniqueConstraint(
            "user_id", "title", name="uq_user_watched_folder_title"
        ),
    )
    op.create_index(
        "ix_user_watched_folders_user_id",
        "user_watched_folders",
        ["user_id"],
    )
    op.add_column(
        "user_watched",
        sa.Column("folder_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "user_watched_folder_id_fkey",
        "user_watched",
        "user_watched_folders",
        ["folder_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_user_watched_folder_id", "user_watched", ["folder_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_user_watched_folder_id", table_name="user_watched")
    op.drop_constraint(
        "user_watched_folder_id_fkey", "user_watched", type_="foreignkey"
    )
    op.drop_column("user_watched", "folder_id")
    op.drop_index(
        "ix_user_watched_folders_user_id", table_name="user_watched_folders"
    )
    op.drop_table("user_watched_folders")
