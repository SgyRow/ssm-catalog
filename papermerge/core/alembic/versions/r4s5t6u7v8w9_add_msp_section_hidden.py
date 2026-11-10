"""add msp_sections.hidden

Allows hiding individual sections of a concrete measure (the text is still
stored, the section is just not rendered in the measure view or PDF).

Revision ID: r4s5t6u7v8w9
Revises: q3r4s5t6u7
Create Date: 2026-11-10

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "r4s5t6u7v8w9"
down_revision: str | Sequence[str] | None = "q3r4s5t6u7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "msp_sections",
        sa.Column(
            "hidden",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("msp_sections", "hidden")
