"""widen nodes.title to 500 characters

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-07-01

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from papermerge.core import constants as const

revision: str = "f2a3b4c5d6e7"
down_revision: str | Sequence[str] | None = "e1f2a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "nodes",
        "title",
        existing_type=sa.String(length=200),
        type_=sa.String(length=const.NODE_TITLE_MAX_LENGTH),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "nodes",
        "title",
        existing_type=sa.String(length=const.NODE_TITLE_MAX_LENGTH),
        type_=sa.String(length=200),
        existing_nullable=False,
    )
