"""add hot path indexes for preview performance

Revision ID: c9f5f67c2b8e
Revises: 1240862ec13d
Create Date: 2026-04-23 11:20:00.000000
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9f5f67c2b8e"
down_revision: str | Sequence[str] | None = "e8f9a0b1c2d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_nodes_parent_id_deleted_at",
        "nodes",
        ["parent_id", "deleted_at"],
        unique=False,
    )
    op.create_index(
        "ix_shared_nodes_node_user_group_role",
        "shared_nodes",
        ["node_id", "user_id", "group_id", "recipient_role_id"],
        unique=False,
    )
    op.create_index(
        "ix_document_versions_document_id_number",
        "document_versions",
        ["document_id", "number"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_document_versions_document_id_number", table_name="document_versions")
    op.drop_index("ix_shared_nodes_node_user_group_role", table_name="shared_nodes")
    op.drop_index("ix_nodes_parent_id_deleted_at", table_name="nodes")
