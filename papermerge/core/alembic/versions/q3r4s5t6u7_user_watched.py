"""user watched nodes (watch list)

Revision ID: q3r4s5t6u7
Revises: p2q3r4s5t6
Create Date: 2026-01-01

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "q3r4s5t6u7"
down_revision: str | Sequence[str] | None = "p2q3r4s5t6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_watched",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("node_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["node_id"], ["nodes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "node_id", name="user_watched_pkey"),
    )
    op.create_index("ix_user_watched_node_id", "user_watched", ["node_id"])


def downgrade() -> None:
    op.drop_index("ix_user_watched_node_id", table_name="user_watched")
    op.drop_table("user_watched")
