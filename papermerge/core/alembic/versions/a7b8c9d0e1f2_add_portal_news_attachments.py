"""add portal_news_attachments

Revision ID: a7b8c9d0e1f2
Revises: f8a9b0c1d2e3
Create Date: 2026-05-14

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a7b8c9d0e1f2"
down_revision: str | Sequence[str] | None = "f8a9b0c1d2e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "portal_news_attachments",
        sa.Column("news_id", sa.Uuid(), nullable=False),
        sa.Column("node_id", sa.Uuid(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["news_id"],
            ["portal_news.id"],
            name="portal_news_attachments_news_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["node_id"],
            ["nodes.id"],
            name="portal_news_attachments_node_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("news_id", "node_id", name="portal_news_attachments_pkey"),
    )


def downgrade() -> None:
    op.drop_table("portal_news_attachments")
