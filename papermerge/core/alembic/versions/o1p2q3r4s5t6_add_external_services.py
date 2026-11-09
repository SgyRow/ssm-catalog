"""add external_services table and seed Госуслуги

Revision ID: o1p2q3r4s5t6
Revises: n0i1j2k3l4m5
Create Date: 2026-11-06

"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "o1p2q3r4s5t6"
down_revision: str | Sequence[str] | None = "n0i1j2k3l4m5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

GOSUSLUGI_ID = "0a1b2c3d-4e5f-4789-8abc-def012345678"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "external_services" not in inspector.get_table_names():
        op.create_table(
            "external_services",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("url", sa.String(length=2000), nullable=False),
            sa.Column("logo_url", sa.String(length=2000), nullable=True),
            sa.Column("slug", sa.String(length=64), nullable=True),
            sa.Column("builtin", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("sort_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id", name="external_services_pkey"),
            sa.UniqueConstraint("slug", name="uq_external_services_slug"),
        )
    op.execute(
        sa.text(
            """
            INSERT INTO external_services
                (id, title, url, logo_url, slug, builtin, sort_index, created_at)
            SELECT
                :id,
                'Госуслуги',
                'https://www.gosuslugi.ru/',
                NULL,
                'gosuslugi',
                true,
                0,
                NOW()
            WHERE NOT EXISTS (
                SELECT 1 FROM external_services WHERE slug = 'gosuslugi'
            )
            """
        ).bindparams(id=uuid.UUID(GOSUSLUGI_ID))
    )


def downgrade() -> None:
    op.drop_table("external_services")
