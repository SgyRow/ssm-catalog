"""add portal_settings for legal portal root

Revision ID: d1e2f3a4b5c6
Revises: c9f5f67c2b8e
Create Date: 2026-05-14

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, None] = "c9f5f67c2b8e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "portal_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("portal_root_node_id", sa.Uuid(), nullable=True),
        sa.Column("portal_group_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["portal_group_id"],
            ["groups.id"],
            name="portal_settings_portal_group_id_fkey",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["portal_root_node_id"],
            ["nodes.id"],
            name="portal_settings_portal_root_node_id_fkey",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("portal_settings")
