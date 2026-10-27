from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core.features.feedback.db import orm as fb_orm
from papermerge.core.features.users.db.orm import User

PREVIEW_LEN = 160


def _preview(body: str) -> str:
    return " ".join(body.split())[:PREVIEW_LEN]


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def get_thread_by_user(
    db_session: AsyncSession, user_id: UUID
) -> fb_orm.FeedbackThread | None:
    stmt = select(fb_orm.FeedbackThread).where(
        fb_orm.FeedbackThread.user_id == user_id
    )
    return (await db_session.execute(stmt)).scalar_one_or_none()


async def get_thread(
    db_session: AsyncSession, thread_id: UUID
) -> fb_orm.FeedbackThread | None:
    stmt = select(fb_orm.FeedbackThread).where(fb_orm.FeedbackThread.id == thread_id)
    return (await db_session.execute(stmt)).scalar_one_or_none()


async def get_or_create_thread(
    db_session: AsyncSession, user_id: UUID
) -> fb_orm.FeedbackThread:
    thread = await get_thread_by_user(db_session, user_id)
    if thread is not None:
        return thread
    thread = fb_orm.FeedbackThread(
        user_id=user_id,
        last_message_at=_now(),
        last_preview="",
        unread_for_staff=0,
        unread_for_user=0,
    )
    db_session.add(thread)
    await db_session.flush()
    return thread


async def list_messages(
    db_session: AsyncSession, thread_id: UUID
) -> list[tuple[fb_orm.FeedbackMessage, str | None]]:
    stmt = (
        select(fb_orm.FeedbackMessage, User.username)
        .outerjoin(User, User.id == fb_orm.FeedbackMessage.author_id)
        .where(fb_orm.FeedbackMessage.thread_id == thread_id)
        .order_by(fb_orm.FeedbackMessage.created_at.asc())
    )
    rows = (await db_session.execute(stmt)).all()
    return [(row[0], row[1]) for row in rows]


async def add_message(
    db_session: AsyncSession,
    *,
    thread: fb_orm.FeedbackThread,
    author_id: UUID,
    body: str,
    from_staff: bool,
) -> fb_orm.FeedbackMessage:
    message = fb_orm.FeedbackMessage(
        thread_id=thread.id,
        author_id=author_id,
        body=body,
        from_staff=from_staff,
        created_at=_now(),
    )
    db_session.add(message)
    thread.last_message_at = _now()
    thread.last_preview = _preview(body)
    if from_staff:
        thread.unread_for_user += 1
        thread.unread_for_staff = 0
    else:
        thread.unread_for_staff += 1
        thread.unread_for_user = 0
    await db_session.flush()
    return message


def mark_user_read(thread: fb_orm.FeedbackThread) -> None:
    thread.unread_for_user = 0


def mark_staff_read(thread: fb_orm.FeedbackThread) -> None:
    thread.unread_for_staff = 0


async def list_threads(
    db_session: AsyncSession,
) -> list[tuple[fb_orm.FeedbackThread, str]]:
    stmt = (
        select(fb_orm.FeedbackThread, User.username)
        .join(User, User.id == fb_orm.FeedbackThread.user_id)
        .order_by(
            fb_orm.FeedbackThread.unread_for_staff.desc(),
            fb_orm.FeedbackThread.last_message_at.desc(),
        )
    )
    rows = (await db_session.execute(stmt)).all()
    return [(row[0], row[1]) for row in rows]


async def user_unread(db_session: AsyncSession, user_id: UUID) -> int:
    stmt = select(fb_orm.FeedbackThread.unread_for_user).where(
        fb_orm.FeedbackThread.user_id == user_id
    )
    value = (await db_session.execute(stmt)).scalar_one_or_none()
    return int(value or 0)


async def inbox_unread(db_session: AsyncSession) -> int:
    thread_stmt = select(
        func.coalesce(func.sum(fb_orm.FeedbackThread.unread_for_staff), 0)
    )
    thread_unread = int((await db_session.execute(thread_stmt)).scalar_one() or 0)
    wish_stmt = select(func.count()).select_from(fb_orm.FeedbackWish).where(
        fb_orm.FeedbackWish.read_at.is_(None)
    )
    wish_unread = int((await db_session.execute(wish_stmt)).scalar_one() or 0)
    return thread_unread + wish_unread


async def add_wish(
    db_session: AsyncSession,
    *,
    author_id: UUID,
    subject: str,
    body: str,
) -> fb_orm.FeedbackWish:
    wish = fb_orm.FeedbackWish(
        author_id=author_id,
        subject=subject,
        body=body,
        created_at=_now(),
    )
    db_session.add(wish)
    await db_session.flush()
    return wish


async def get_wish(
    db_session: AsyncSession, wish_id: UUID
) -> fb_orm.FeedbackWish | None:
    stmt = select(fb_orm.FeedbackWish).where(fb_orm.FeedbackWish.id == wish_id)
    return (await db_session.execute(stmt)).scalar_one_or_none()


def mark_wish_read(wish: fb_orm.FeedbackWish) -> None:
    if wish.read_at is None:
        wish.read_at = _now()


async def list_wishes(
    db_session: AsyncSession,
) -> list[tuple[fb_orm.FeedbackWish, str | None]]:
    stmt = (
        select(fb_orm.FeedbackWish, User.username)
        .outerjoin(User, User.id == fb_orm.FeedbackWish.author_id)
        .order_by(
            fb_orm.FeedbackWish.read_at.asc().nulls_first(),
            fb_orm.FeedbackWish.created_at.desc(),
        )
    )
    rows = (await db_session.execute(stmt)).all()
    return [(row[0], row[1]) for row in rows]


async def username_by_id(db_session: AsyncSession, user_id: UUID) -> str | None:
    stmt = select(User.username).where(User.id == user_id)
    return (await db_session.execute(stmt)).scalar_one_or_none()
