"""add nodes.sort_index for manual catalog order

Revision ID: j6e7f8a9b0c1
Revises: i5d6e7f8a9b0
Create Date: 2026-08-19

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "j6e7f8a9b0c1"
down_revision: str | Sequence[str] | None = "i5d6e7f8a9b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PG_BACKFILL = """
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY parent_id
            ORDER BY
                CASE WHEN ctype = 'folder' THEN 0 ELSE 1 END,
                title,
                created_at
        ) - 1 AS idx
    FROM nodes
    WHERE deleted_at IS NULL
)
UPDATE nodes
SET sort_index = ranked.idx
FROM ranked
WHERE nodes.id = ranked.id
"""

_SQLITE_BACKFILL = """
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY parent_id
            ORDER BY
                CASE WHEN ctype = 'folder' THEN 0 ELSE 1 END,
                title,
                created_at
        ) - 1 AS idx
    FROM nodes
    WHERE deleted_at IS NULL
)
UPDATE nodes
SET sort_index = (
    SELECT idx FROM ranked WHERE ranked.id = nodes.id
)
WHERE id IN (SELECT id FROM ranked)
"""


def upgrade() -> None:
    op.add_column(
        "nodes",
        sa.Column(
            "sort_index",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text(_PG_BACKFILL))
    else:
        op.execute(sa.text(_SQLITE_BACKFILL))
    op.create_index(
        "ix_nodes_parent_id_sort_index",
        "nodes",
        ["parent_id", "sort_index"],
    )


def downgrade() -> None:
    op.drop_index("ix_nodes_parent_id_sort_index", table_name="nodes")
    op.drop_column("nodes", "sort_index")
