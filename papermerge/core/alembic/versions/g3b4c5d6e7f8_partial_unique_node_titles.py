"""partial unique indexes for active node titles only

Revision ID: g3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-07-01

Trashed nodes no longer block re-using the same title in a folder.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "g3b4c5d6e7f8"
down_revision: str | Sequence[str] | None = "f2a3b4c5d6e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ACTIVE_USER_TITLE = sa.text("deleted_at IS NULL AND user_id IS NOT NULL")
_ACTIVE_GROUP_TITLE = sa.text("deleted_at IS NULL AND group_id IS NOT NULL")


def upgrade() -> None:
    op.drop_constraint("unique title per parent per user", "nodes", type_="unique")
    op.drop_constraint("unique title per parent per group", "nodes", type_="unique")
    op.create_index(
        "unique_title_per_parent_per_user_active",
        "nodes",
        ["parent_id", "title", "user_id"],
        unique=True,
        postgresql_where=_ACTIVE_USER_TITLE,
        sqlite_where=_ACTIVE_USER_TITLE,
    )
    op.create_index(
        "unique_title_per_parent_per_group_active",
        "nodes",
        ["parent_id", "title", "group_id"],
        unique=True,
        postgresql_where=_ACTIVE_GROUP_TITLE,
        sqlite_where=_ACTIVE_GROUP_TITLE,
    )


def downgrade() -> None:
    op.drop_index("unique_title_per_parent_per_group_active", table_name="nodes")
    op.drop_index("unique_title_per_parent_per_user_active", table_name="nodes")
    op.create_unique_constraint(
        "unique title per parent per group",
        "nodes",
        ["parent_id", "title", "group_id"],
    )
    op.create_unique_constraint(
        "unique title per parent per user",
        "nodes",
        ["parent_id", "title", "user_id"],
    )
