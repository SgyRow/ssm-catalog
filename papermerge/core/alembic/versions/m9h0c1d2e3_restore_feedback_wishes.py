"""restore one-shot feedback wishes

Revision ID: m9h0c1d2e3
Revises: l8g9b0c1d2e3
Create Date: 2026-10-27

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "m9h0c1d2e3"
down_revision: str | Sequence[str] | None = "l8g9b0c1d2e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "feedback_wishes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("subject", sa.String(length=500), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["users.id"],
            name="feedback_wishes_author_id_fkey",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="feedback_wishes_pkey"),
    )


def downgrade() -> None:
    op.drop_table("feedback_wishes")
