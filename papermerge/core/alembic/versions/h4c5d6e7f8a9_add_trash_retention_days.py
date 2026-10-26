"""add trash_retention_days to library_settings

Revision ID: h4c5d6e7f8a9
Revises: g3b4c5d6e7f8
Create Date: 2026-07-02

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "h4c5d6e7f8a9"
down_revision: str | Sequence[str] | None = "g3b4c5d6e7f8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "library_settings",
        sa.Column("trash_retention_days", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("library_settings", "trash_retention_days")
