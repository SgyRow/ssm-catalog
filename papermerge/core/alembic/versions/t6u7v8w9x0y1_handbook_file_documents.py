"""add handbook file documents (standalone uploaded files as reference items)

Revision ID: t6u7v8w9x0y1
Revises: s5t6u7v8w9x0
Create Date: 2026-11-13

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "t6u7v8w9x0y1"
down_revision: str | Sequence[str] | None = "s5t6u7v8w9x0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "handbook_articles",
        sa.Column("kind", sa.String(length=20), nullable=False, server_default="article"),
    )
    op.add_column(
        "handbook_articles",
        sa.Column("file_filename", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "handbook_articles",
        sa.Column("file_content_type", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "handbook_articles",
        sa.Column("file_size_bytes", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("handbook_articles", "file_size_bytes")
    op.drop_column("handbook_articles", "file_content_type")
    op.drop_column("handbook_articles", "file_filename")
    op.drop_column("handbook_articles", "kind")
