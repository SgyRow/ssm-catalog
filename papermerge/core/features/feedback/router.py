from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Security
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import exceptions as exc
from papermerge.core import schema
from papermerge.core.db.engine import get_db
from papermerge.core.features.auth import get_current_user, scopes
from papermerge.core.features.feedback import schema as fb_schema
from papermerge.core.features.feedback.db import api as fb_api
from papermerge.core.features.feedback.db import orm as fb_orm
from papermerge.core.features.library_ts.db import api as lib_api
from papermerge.core.features.users.schema import user_display_name

router = APIRouter(prefix="/feedback", tags=["feedback"])


def _can_manage(user: schema.User) -> bool:
    if user.is_superuser:
        return True
    return scopes.FEEDBACK_MANAGE in (user.scopes or [])


def _require_manage(user: schema.User) -> None:
    if not _can_manage(user):
        raise exc.HTTP403Forbidden()


def _author_name(username: str | None, from_staff: bool) -> str:
    if username:
        return username
    return "admin" if from_staff else "user"


def _sender_name(user: schema.User) -> str:
    return user_display_name(user.first_name, user.last_name, user.username)


def _message_out(
    message: fb_orm.FeedbackMessage, username: str | None
) -> fb_schema.FeedbackMessageOut:
    return fb_schema.FeedbackMessageOut(
        id=message.id,
        body=message.body,
        from_staff=message.from_staff,
        author_name=_author_name(username, message.from_staff),
        created_at=message.created_at,
    )


async def _messages_out(
    db_session: AsyncSession, thread_id: UUID
) -> list[fb_schema.FeedbackMessageOut]:
    rows = await fb_api.list_messages(db_session, thread_id)
    return [_message_out(message, username) for message, username in rows]


@router.get("/unread", response_model=fb_schema.FeedbackUnreadOut)
async def unread_counts(
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> fb_schema.FeedbackUnreadOut:
    mine = await fb_api.user_unread(db_session, user.id)
    inbox = await fb_api.inbox_unread(db_session) if _can_manage(user) else 0
    return fb_schema.FeedbackUnreadOut(mine=mine, inbox=inbox)


@router.get("/me", response_model=fb_schema.FeedbackMyThreadOut)
async def my_thread(
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> fb_schema.FeedbackMyThreadOut:
    thread = await fb_api.get_thread_by_user(db_session, user.id)
    if thread is None:
        return fb_schema.FeedbackMyThreadOut()
    fb_api.mark_user_read(thread)
    await lib_api.mark_feedback_notifications_read(db_session, user.id, thread.id)
    await db_session.commit()
    return fb_schema.FeedbackMyThreadOut(
        id=thread.id,
        unread=0,
        messages=await _messages_out(db_session, thread.id),
    )


@router.post("/me/messages", response_model=fb_schema.FeedbackMessageOut)
async def send_my_message(
    payload: fb_schema.FeedbackMessageCreateIn,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> fb_schema.FeedbackMessageOut:
    thread = await fb_api.get_or_create_thread(db_session, user.id)
    message = await fb_api.add_message(
        db_session,
        thread=thread,
        author_id=user.id,
        body=payload.body,
        from_staff=False,
    )
    await lib_api.notify_feedback_message(
        db_session,
        thread_id=thread.id,
        author_id=user.id,
        author_username=_sender_name(user),
        preview=thread.last_preview,
        from_staff=False,
    )
    await db_session.commit()
    return _message_out(message, _sender_name(user))


@router.get("/threads", response_model=list[fb_schema.FeedbackThreadOut])
async def list_threads(
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> list[fb_schema.FeedbackThreadOut]:
    _require_manage(user)
    rows = await fb_api.list_threads(db_session)
    return [
        fb_schema.FeedbackThreadOut(
            id=thread.id,
            user_id=thread.user_id,
            username=username,
            last_preview=thread.last_preview,
            last_message_at=thread.last_message_at,
            unread_for_staff=thread.unread_for_staff,
        )
        for thread, username in rows
    ]


@router.get("/threads/{thread_id}", response_model=fb_schema.FeedbackThreadDetailOut)
async def get_thread(
    thread_id: UUID,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> fb_schema.FeedbackThreadDetailOut:
    _require_manage(user)
    thread = await fb_api.get_thread(db_session, thread_id)
    if thread is None:
        raise exc.HTTP404NotFound()
    username = await fb_api.display_name_by_id(db_session, thread.user_id) or "user"
    fb_api.mark_staff_read(thread)
    await lib_api.mark_feedback_notifications_read(
        db_session, user.id, thread.id
    )
    await db_session.commit()
    return fb_schema.FeedbackThreadDetailOut(
        id=thread.id,
        user_id=thread.user_id,
        username=username,
        unread_for_staff=0,
        messages=await _messages_out(db_session, thread.id),
    )


def _wish_out(
    wish: fb_orm.FeedbackWish, username: str | None
) -> fb_schema.FeedbackWishOut:
    return fb_schema.FeedbackWishOut(
        id=wish.id,
        subject=wish.subject,
        body=wish.body,
        author_name=username or "user",
        created_at=wish.created_at,
        read_at=wish.read_at,
    )


@router.post("/wishes", response_model=fb_schema.FeedbackWishOut)
async def send_wish(
    payload: fb_schema.FeedbackWishCreateIn,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> fb_schema.FeedbackWishOut:
    wish = await fb_api.add_wish(
        db_session,
        author_id=user.id,
        subject=payload.subject,
        body=payload.body,
    )
    await lib_api.notify_feedback_wish(
        db_session,
        wish_id=wish.id,
        author_id=user.id,
        author_username=_sender_name(user),
        subject=wish.subject,
        preview=" ".join(wish.body.split())[:160],
    )
    await db_session.commit()
    return _wish_out(wish, _sender_name(user))


@router.get("/wishes", response_model=list[fb_schema.FeedbackWishOut])
async def list_wishes(
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> list[fb_schema.FeedbackWishOut]:
    _require_manage(user)
    rows = await fb_api.list_wishes(db_session)
    return [_wish_out(wish, username) for wish, username in rows]


@router.get("/wishes/{wish_id}", response_model=fb_schema.FeedbackWishOut)
async def get_wish(
    wish_id: UUID,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> fb_schema.FeedbackWishOut:
    _require_manage(user)
    wish = await fb_api.get_wish(db_session, wish_id)
    if wish is None:
        raise exc.HTTP404NotFound()
    fb_api.mark_wish_read(wish)
    await lib_api.mark_feedback_wish_notifications_read(
        db_session, user.id, wish.id
    )
    await db_session.commit()
    username = (
        await fb_api.display_name_by_id(db_session, wish.author_id)
        if wish.author_id
        else None
    )
    return _wish_out(wish, username)


@router.post(
    "/threads/{thread_id}/messages", response_model=fb_schema.FeedbackMessageOut
)
async def reply_to_thread(
    thread_id: UUID,
    payload: fb_schema.FeedbackMessageCreateIn,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> fb_schema.FeedbackMessageOut:
    _require_manage(user)
    thread = await fb_api.get_thread(db_session, thread_id)
    if thread is None:
        raise exc.HTTP404NotFound()
    message = await fb_api.add_message(
        db_session,
        thread=thread,
        author_id=user.id,
        body=payload.body,
        from_staff=True,
    )
    await lib_api.notify_feedback_message(
        db_session,
        thread_id=thread.id,
        author_id=user.id,
        author_username=_sender_name(user),
        preview=thread.last_preview,
        from_staff=True,
        recipient_user_id=thread.user_id,
    )
    await db_session.commit()
    return _message_out(message, _sender_name(user))


@router.delete("/threads/{thread_id}/messages/{message_id}", status_code=204)
async def delete_thread_message(
    thread_id: UUID,
    message_id: UUID,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> None:
    _require_manage(user)
    thread = await fb_api.get_thread(db_session, thread_id)
    if thread is None:
        raise exc.HTTP404NotFound()
    deleted = await fb_api.delete_message(db_session, thread, message_id)
    if not deleted:
        raise exc.HTTP404NotFound()
    await db_session.commit()


@router.delete("/threads/{thread_id}", status_code=204)
async def delete_thread(
    thread_id: UUID,
    user: Annotated[schema.User, Security(get_current_user)],
    db_session: AsyncSession = Depends(get_db),
) -> None:
    _require_manage(user)
    deleted = await fb_api.delete_thread(db_session, thread_id)
    if not deleted:
        raise exc.HTTP404NotFound()
    await lib_api.delete_feedback_message_notifications(db_session, thread_id)
    await db_session.commit()
