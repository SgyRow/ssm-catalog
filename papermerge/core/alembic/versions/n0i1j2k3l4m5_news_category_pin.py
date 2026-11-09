"""add category and pin flag to portal news

Revision ID: n0i1j2k3l4m5
Revises: a1b2c3d4e5f6
Create Date: 2026-11-06

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "n0i1j2k3l4m5"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "portal_news",
        sa.Column("category", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "portal_news",
        sa.Column(
            "is_pinned",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_index(
        "ix_portal_news_category", "portal_news", ["category"], unique=False
    )
    op.create_index(
        "ix_portal_news_is_pinned", "portal_news", ["is_pinned"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_portal_news_is_pinned", table_name="portal_news")
    op.drop_index("ix_portal_news_category", table_name="portal_news")
    op.drop_column("portal_news", "is_pinned")
    op.drop_column("portal_news", "category")
