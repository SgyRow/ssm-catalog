"""add msp tables (measures of social support)

Revision ID: a1b2c3d4e5f6
Revises: m9h0c1d2e3
Create Date: 2026-11-01

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "m9h0c1d2e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "msp_types",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=300), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="msp_types_pkey"),
        sa.UniqueConstraint("name", name="uq_msp_types_name"),
    )
    op.create_table(
        "msp_type_sections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("msp_type_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["msp_type_id"],
            ["msp_types.id"],
            name="msp_type_sections_msp_type_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="msp_type_sections_pkey"),
    )
    op.create_index(
        "ix_msp_type_sections_msp_type_id",
        "msp_type_sections",
        ["msp_type_id"],
    )
    op.create_table(
        "msps",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("node_id", sa.Uuid(), nullable=False),
        sa.Column("msp_type_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["node_id"],
            ["nodes.id"],
            name="msps_node_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["msp_type_id"],
            ["msp_types.id"],
            name="msps_msp_type_id_fkey",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="msps_pkey"),
        sa.UniqueConstraint("node_id", name="uq_msps_node_id"),
    )
    op.create_index("ix_msps_msp_type_id", "msps", ["msp_type_id"])
    op.create_table(
        "msp_sections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("msp_id", sa.Uuid(), nullable=False),
        sa.Column("type_section_id", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["msp_id"],
            ["msps.id"],
            name="msp_sections_msp_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["type_section_id"],
            ["msp_type_sections.id"],
            name="msp_sections_type_section_id_fkey",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="msp_sections_pkey"),
    )
    op.create_index("ix_msp_sections_msp_id", "msp_sections", ["msp_id"])
    op.create_index("ix_msp_sections_type_section_id", "msp_sections", ["type_section_id"])


def downgrade() -> None:
    op.drop_index("ix_msp_sections_type_section_id", table_name="msp_sections")
    op.drop_index("ix_msp_sections_msp_id", table_name="msp_sections")
    op.drop_table("msp_sections")
    op.drop_index("ix_msps_msp_type_id", table_name="msps")
    op.drop_table("msps")
    op.drop_index("ix_msp_type_sections_msp_type_id", table_name="msp_type_sections")
    op.drop_table("msp_type_sections")
    op.drop_table("msp_types")
