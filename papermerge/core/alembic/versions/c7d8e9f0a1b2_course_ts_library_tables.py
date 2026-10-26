"""Course TS: soft-delete on nodes + library tables (favorites, audit, etc.)

Revision ID: c7d8e9f0a1b2
Revises: 50ef5a403d27
Create Date: 2026-04-06

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, None] = "50ef5a403d27"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("nodes", sa.Column("deleted_at", sa.DateTime(), nullable=True))

    op.create_table(
        "user_favorites",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("node_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["node_id"], ["nodes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "node_id"),
    )
    op.create_index("ix_user_favorites_user_id", "user_favorites", ["user_id"])

    op.create_table(
        "user_recent_documents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("node_id", sa.Uuid(), nullable=False),
        sa.Column("viewed_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["node_id"], ["nodes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_user_recent_user_viewed",
        "user_recent_documents",
        ["user_id", "viewed_at"],
    )

    op.create_table(
        "audit_log_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=False),
        sa.Column("resource_id", sa.Uuid(), nullable=True),
        sa.Column("detail", sa.String(length=2000), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_created", "audit_log_entries", ["created_at"])
    op.create_index("ix_audit_user", "audit_log_entries", ["user_id"])

    op.create_table(
        "document_notes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("body", sa.String(length=8000), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["nodes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "document_id", name="uq_note_per_user_doc"),
    )

    op.create_table(
        "document_comments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("body", sa.String(length=8000), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["nodes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_doc_comments_doc", "document_comments", ["document_id"])

    op.create_table(
        "document_ratings",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["nodes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "document_id"),
        sa.CheckConstraint("score >= 1 AND score <= 5", name="ck_rating_score_1_5"),
    )

    op.create_table(
        "document_counters",
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("download_count", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["document_id"], ["nodes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("document_id"),
    )

    op.create_table(
        "user_notifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("payload", sa.String(length=4000), nullable=True),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notif_user_created", "user_notifications", ["user_id", "created_at"])

    op.create_table(
        "search_query_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("query_text", sa.String(length=2000), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sqlog_created", "search_query_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("search_query_logs")
    op.drop_table("user_notifications")
    op.drop_table("document_counters")
    op.drop_table("document_ratings")
    op.drop_table("document_comments")
    op.drop_table("document_notes")
    op.drop_table("audit_log_entries")
    op.drop_table("user_recent_documents")
    op.drop_table("user_favorites")
    op.drop_column("nodes", "deleted_at")
