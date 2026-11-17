"""add msp_normative_links (central NPA registry links)

Revision ID: v8w9x0y1z2a3
Revises: u7v8w9x0y1z2
Create Date: 2026-11-17

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "v8w9x0y1z2a3"
down_revision: str | Sequence[str] | None = "u7v8w9x0y1z2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "msp_normative_links",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("msp_id", sa.Uuid(), nullable=False),
        sa.Column("bucket", sa.String(length=100), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["msp_id"],
            ["msps.id"],
            name="msp_normative_links_msp_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["nodes.id"],
            name="msp_normative_links_document_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="msp_normative_links_pkey"),
        sa.UniqueConstraint(
            "msp_id",
            "document_id",
            name="uq_msp_normative_links_msp_document",
        ),
    )
    op.create_index(
        "ix_msp_normative_links_msp_id",
        "msp_normative_links",
        ["msp_id"],
    )
    op.create_index(
        "ix_msp_normative_links_document_id",
        "msp_normative_links",
        ["document_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_msp_normative_links_document_id", table_name="msp_normative_links")
    op.drop_index("ix_msp_normative_links_msp_id", table_name="msp_normative_links")
    op.drop_table("msp_normative_links")
