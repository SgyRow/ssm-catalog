"""one persistent feedback chat per user

Revision ID: l8g9b0c1d2e3
Revises: k7f8a9b0c1d2
Create Date: 2026-10-27

"""

from collections.abc import Sequence
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision: str = "l8g9b0c1d2e3"
down_revision: str | Sequence[str] | None = "k7f8a9b0c1d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "feedback_threads",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_preview", sa.String(length=200), nullable=False),
        sa.Column("unread_for_staff", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unread_for_user", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="feedback_threads_user_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="feedback_threads_pkey"),
        sa.UniqueConstraint("user_id", name="feedback_threads_user_id_key"),
    )
    op.create_table(
        "feedback_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("thread_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("from_staff", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["thread_id"],
            ["feedback_threads.id"],
            name="feedback_messages_thread_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["users.id"],
            name="feedback_messages_author_id_fkey",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="feedback_messages_pkey"),
    )
    op.create_index(
        "ix_feedback_messages_thread_created",
        "feedback_messages",
        ["thread_id", "created_at"],
    )

    conn = op.get_bind()
    wishes = conn.execute(
        sa.text(
            "SELECT subject, body, author_id, created_at "
            "FROM feedback_wishes "
            "WHERE author_id IS NOT NULL "
            "ORDER BY created_at"
        )
    ).fetchall()
    threads: dict = {}
    for subject, body, author_id, created_at in wishes:
        thread_id = threads.get(author_id)
        if thread_id is None:
            thread_id = uuid4()
            threads[author_id] = thread_id
            conn.execute(
                sa.text(
                    "INSERT INTO feedback_threads "
                    "(id, user_id, last_message_at, last_preview, "
                    "unread_for_staff, unread_for_user) "
                    "VALUES (:id, :user_id, :last_message_at, :last_preview, 0, 0)"
                ),
                {
                    "id": thread_id,
                    "user_id": author_id,
                    "last_message_at": created_at,
                    "last_preview": "",
                },
            )
        text = f"{subject}\n\n{body}".strip()
        preview = " ".join(text.split())[:160]
        conn.execute(
            sa.text(
                "INSERT INTO feedback_messages "
                "(id, thread_id, author_id, body, from_staff, created_at) "
                "VALUES (:id, :thread_id, :author_id, :body, false, :created_at)"
            ),
            {
                "id": uuid4(),
                "thread_id": thread_id,
                "author_id": author_id,
                "body": text,
                "created_at": created_at,
            },
        )
        conn.execute(
            sa.text(
                "UPDATE feedback_threads "
                "SET last_message_at = :last_message_at, "
                "last_preview = :last_preview, "
                "unread_for_staff = unread_for_staff + 1 "
                "WHERE id = :id"
            ),
            {
                "id": thread_id,
                "last_message_at": created_at,
                "last_preview": preview,
            },
        )

    op.drop_table("feedback_wishes")


def downgrade() -> None:
    op.create_table(
        "feedback_wishes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("subject", sa.String(length=500), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["users.id"],
            name="feedback_wishes_author_id_fkey",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="feedback_wishes_pkey"),
    )
    op.drop_index("ix_feedback_messages_thread_created", table_name="feedback_messages")
    op.drop_table("feedback_messages")
    op.drop_table("feedback_threads")
