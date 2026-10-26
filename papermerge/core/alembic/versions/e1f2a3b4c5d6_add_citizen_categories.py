"""add citizen_categories and citizen_category_folders tables

Revision ID: e1f2a3b4c5d6
Revises: b1c2d3e4f5a6
Create Date: 2026-06-30

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: str | Sequence[str] | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "citizen_categories",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_citizen_categories_name"),
    )
    op.create_table(
        "citizen_category_folders",
        sa.Column("category_id", sa.Uuid(), nullable=False),
        sa.Column("node_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["citizen_categories.id"],
            name="citizen_category_folders_category_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["node_id"],
            ["nodes.id"],
            name="citizen_category_folders_node_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("category_id", "node_id"),
        sa.UniqueConstraint(
            "category_id",
            "node_id",
            name="uq_citizen_category_folder",
        ),
    )
    op.create_index(
        "ix_citizen_category_folders_node_id",
        "citizen_category_folders",
        ["node_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_citizen_category_folders_node_id",
        table_name="citizen_category_folders",
    )
    op.drop_table("citizen_category_folders")
    op.drop_table("citizen_categories")
