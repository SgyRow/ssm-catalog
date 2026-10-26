"""shared_nodes: share with all users that have a given account role

Revision ID: e8f9a0b1c2d3
Revises: c7d8e9f0a1b2
Create Date: 2026-04-06

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e8f9a0b1c2d3"
down_revision: Union[str, None] = "c7d8e9f0a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "shared_nodes",
        sa.Column("recipient_role_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "shared_nodes_recipient_role_id_fkey",
        "shared_nodes",
        "roles",
        ["recipient_role_id"],
        ["id"],
        ondelete="CASCADE",
        use_alter=True,
    )
    op.drop_constraint(
        "check__user_id_not_null__or__group_id_not_null",
        "shared_nodes",
        type_="check",
    )
    op.create_check_constraint(
        "check__shared_nodes_exactly_one_audience",
        "shared_nodes",
        sa.text(
            "(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN group_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN recipient_role_id IS NOT NULL THEN 1 ELSE 0 END) = 1"
        ),
    )


def downgrade() -> None:
    op.drop_constraint(
        "check__shared_nodes_exactly_one_audience",
        "shared_nodes",
        type_="check",
    )
    op.execute(
        sa.text("DELETE FROM shared_nodes WHERE recipient_role_id IS NOT NULL")
    )
    op.drop_constraint(
        "shared_nodes_recipient_role_id_fkey",
        "shared_nodes",
        type_="foreignkey",
    )
    op.drop_column("shared_nodes", "recipient_role_id")
    op.create_check_constraint(
        "check__user_id_not_null__or__group_id_not_null",
        "shared_nodes",
        sa.text("user_id IS NOT NULL OR group_id IS NOT NULL"),
    )
