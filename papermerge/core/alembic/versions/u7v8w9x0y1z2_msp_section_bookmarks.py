"""favorites/watched for MSP sections

Revision ID: u7v8w9x0y1z2
Revises: t6u7v8w9x0y1
Create Date: 2026-11-16

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "u7v8w9x0y1z2"
down_revision: str | Sequence[str] | None = "t6u7v8w9x0y1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing = set(inspector.get_table_names())
    if "user_favorite_msp_sections" in existing:
        return
    op.create_table(
        "user_favorite_msp_sections",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("msp_id", sa.Uuid(), nullable=False),
        sa.Column("type_section_id", sa.Uuid(), nullable=False),
        sa.Column("folder_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["msp_id"], ["msps.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["type_section_id"],
            ["msp_type_sections.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["folder_id"],
            ["user_favorite_folders.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint(
            "user_id",
            "msp_id",
            "type_section_id",
            name="user_favorite_msp_sections_pkey",
        ),
    )
    op.create_index(
        "ix_user_favorite_msp_sections_user_id",
        "user_favorite_msp_sections",
        ["user_id"],
    )

    op.create_table(
        "user_watched_msp_sections",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("msp_id", sa.Uuid(), nullable=False),
        sa.Column("type_section_id", sa.Uuid(), nullable=False),
        sa.Column("folder_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["msp_id"], ["msps.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["type_section_id"],
            ["msp_type_sections.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["folder_id"],
            ["user_watched_folders.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint(
            "user_id",
            "msp_id",
            "type_section_id",
            name="user_watched_msp_sections_pkey",
        ),
    )
    op.create_index(
        "ix_user_watched_msp_sections_user_id",
        "user_watched_msp_sections",
        ["user_id"],
    )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing = set(inspector.get_table_names())
    if "user_favorite_msp_sections" not in existing:
        return
    op.drop_index(
        "ix_user_watched_msp_sections_user_id",
        table_name="user_watched_msp_sections",
    )
    op.drop_table("user_watched_msp_sections")
    op.drop_index(
        "ix_user_favorite_msp_sections_user_id",
        table_name="user_favorite_msp_sections",
    )
    op.drop_table("user_favorite_msp_sections")
