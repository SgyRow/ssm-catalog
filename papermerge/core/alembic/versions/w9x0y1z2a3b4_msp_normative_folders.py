"""msp normative virtual folders (replace link.bucket)

Revision ID: w9x0y1z2a3b4
Revises: v8w9x0y1z2a3
Create Date: 2026-11-17

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "w9x0y1z2a3b4"
down_revision: str | Sequence[str] | None = "v8w9x0y1z2a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "msp_normative_folders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("msp_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["msp_id"],
            ["msps.id"],
            name="msp_normative_folders_msp_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="msp_normative_folders_pkey"),
        sa.UniqueConstraint(
            "msp_id",
            "title",
            name="uq_msp_normative_folders_msp_title",
        ),
    )
    op.create_index(
        "ix_msp_normative_folders_msp_id",
        "msp_normative_folders",
        ["msp_id"],
    )

    op.add_column(
        "msp_normative_links",
        sa.Column("folder_id", sa.Uuid(), nullable=True),
    )

    # Migrate existing bucket strings into virtual folders.
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            """
            SELECT DISTINCT msp_id, bucket
            FROM msp_normative_links
            ORDER BY msp_id, bucket
            """
        )
    ).fetchall()
    folder_map: dict[tuple[object, str], object] = {}
    sort_by_msp: dict[object, int] = {}
    for msp_id, bucket in rows:
        key = (msp_id, bucket)
        if key in folder_map:
            continue
        order = sort_by_msp.get(msp_id, 0)
        sort_by_msp[msp_id] = order + 1
        folder_id = conn.execute(sa.text("SELECT gen_random_uuid()")).scalar_one()
        conn.execute(
            sa.text(
                """
                INSERT INTO msp_normative_folders
                    (id, msp_id, title, sort_order, created_at)
                VALUES
                    (:id, :msp_id, :title, :sort_order, NOW())
                """
            ),
            {
                "id": folder_id,
                "msp_id": msp_id,
                "title": bucket,
                "sort_order": order,
            },
        )
        folder_map[key] = folder_id

    for (msp_id, bucket), folder_id in folder_map.items():
        conn.execute(
            sa.text(
                """
                UPDATE msp_normative_links
                SET folder_id = :folder_id
                WHERE msp_id = :msp_id AND bucket = :bucket
                """
            ),
            {"folder_id": folder_id, "msp_id": msp_id, "bucket": bucket},
        )

    # Measures with no links yet still need default folders after deploy;
    # that is handled at runtime by ensure_default_normative_folders.

    op.alter_column("msp_normative_links", "folder_id", nullable=False)
    op.create_foreign_key(
        "msp_normative_links_folder_id_fkey",
        "msp_normative_links",
        "msp_normative_folders",
        ["folder_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_msp_normative_links_folder_id",
        "msp_normative_links",
        ["folder_id"],
    )
    op.drop_column("msp_normative_links", "bucket")


def downgrade() -> None:
    op.add_column(
        "msp_normative_links",
        sa.Column("bucket", sa.String(length=100), nullable=True),
    )
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE msp_normative_links AS l
            SET bucket = f.title
            FROM msp_normative_folders AS f
            WHERE l.folder_id = f.id
            """
        )
    )
    op.alter_column("msp_normative_links", "bucket", nullable=False)
    op.drop_index("ix_msp_normative_links_folder_id", table_name="msp_normative_links")
    op.drop_constraint(
        "msp_normative_links_folder_id_fkey",
        "msp_normative_links",
        type_="foreignkey",
    )
    op.drop_column("msp_normative_links", "folder_id")
    op.drop_index("ix_msp_normative_folders_msp_id", table_name="msp_normative_folders")
    op.drop_table("msp_normative_folders")
