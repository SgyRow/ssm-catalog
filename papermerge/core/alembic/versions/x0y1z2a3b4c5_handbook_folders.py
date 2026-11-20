"""handbook folders for categorizing reference materials

Revision ID: x0y1z2a3b4c5
Revises: w9x0y1z2a3b4
Create Date: 2026-11-20

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "x0y1z2a3b4c5"
down_revision: str | Sequence[str] | None = "w9x0y1z2a3b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "handbook_folders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="handbook_folders_pkey"),
        sa.UniqueConstraint("title", name="uq_handbook_folders_title"),
    )
    op.add_column(
        "handbook_articles",
        sa.Column("folder_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "handbook_articles_folder_id_fkey",
        "handbook_articles",
        "handbook_folders",
        ["folder_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_handbook_articles_folder_id",
        "handbook_articles",
        ["folder_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_handbook_articles_folder_id", table_name="handbook_articles")
    op.drop_constraint(
        "handbook_articles_folder_id_fkey",
        "handbook_articles",
        type_="foreignkey",
    )
    op.drop_column("handbook_articles", "folder_id")
    op.drop_table("handbook_folders")
