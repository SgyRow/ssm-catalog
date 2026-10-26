"""add document_full_version_attachments

Revision ID: i5d6e7f8a9b0
Revises: h4c5d6e7f8a9
Create Date: 2026-07-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "i5d6e7f8a9b0"
down_revision: str | Sequence[str] | None = "h4c5d6e7f8a9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "document_full_version_attachments",
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("node_id", sa.Uuid(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["nodes.id"],
            name="document_full_version_attachments_document_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["node_id"],
            ["nodes.id"],
            name="document_full_version_attachments_node_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "document_id",
            "node_id",
            name="document_full_version_attachments_pkey",
        ),
    )


def downgrade() -> None:
    op.drop_table("document_full_version_attachments")
