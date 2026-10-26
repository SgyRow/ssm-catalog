"""add node visibility and library_settings

Revision ID: b1c2d3e4f5a6
Revises: a7b8c9d0e1f2
Create Date: 2026-06-22

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "node_visibility",
        sa.Column("node_id", sa.Uuid(), nullable=False),
        sa.Column(
            "access_level",
            sa.Enum("private", "role_based", "public", name="node_access_level"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["node_id"],
            ["nodes.id"],
            name="node_visibility_node_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("node_id"),
    )
    op.create_table(
        "node_visibility_roles",
        sa.Column("node_id", sa.Uuid(), nullable=False),
        sa.Column("role_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["node_id"],
            ["nodes.id"],
            name="node_visibility_roles_node_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["roles.id"],
            name="node_visibility_roles_role_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("node_id", "role_id"),
    )
    op.create_table(
        "library_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("catalog_root_node_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["catalog_root_node_id"],
            ["nodes.id"],
            name="library_settings_catalog_root_node_id_fkey",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("library_settings")
    op.drop_table("node_visibility_roles")
    op.drop_table("node_visibility")
    op.execute("DROP TYPE IF EXISTS node_access_level")
