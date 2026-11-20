"""Expired-trash selection and auto-purge behavior."""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from sqlalchemy import select, update

from papermerge.core import orm
from papermerge.core.features.library_ts.db import api as lib_api
from papermerge.core.features.library_ts.db import settings_api as library_settings_api
from papermerge.core.features.library_ts import trash_purge_scheduler as scheduler


def _utc_naive(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


@pytest.mark.asyncio
async def test_purge_expired_trash_selects_only_past_retention(
    db_session, make_user, make_document
):
    user = await make_user("purge_select_user")
    parent = user.home_folder
    now = _utc_naive(datetime.now(timezone.utc))

    expired = await make_document(
        title="expired-purge.docx", user=user, parent=parent
    )
    fresh = await make_document(
        title="fresh-purge.docx", user=user, parent=parent
    )
    await db_session.execute(
        update(orm.Node)
        .where(orm.Node.id == expired.id)
        .values(deleted_at=now - timedelta(days=40))
    )
    await db_session.execute(
        update(orm.Node)
        .where(orm.Node.id == fresh.id)
        .values(deleted_at=now - timedelta(days=5))
    )
    await db_session.commit()

    ids = await lib_api.purge_expired_trash(
        db_session, retention_days=30, now=now
    )
    assert expired.id in ids
    assert fresh.id not in ids


@pytest.mark.asyncio
async def test_run_auto_trash_purge_hard_deletes_expired(
    db_session, make_user, make_document
):
    user = await make_user("purge_run_user")
    parent = user.home_folder
    now = _utc_naive(datetime.now(timezone.utc))

    await library_settings_api.ensure_library_settings_row(db_session)
    await library_settings_api.set_trash_retention_days(db_session, 30)
    await db_session.commit()

    expired = await make_document(
        title="auto-purge-expired.docx", user=user, parent=parent
    )
    keep = await make_document(
        title="auto-purge-keep.docx", user=user, parent=parent
    )
    await db_session.execute(
        update(orm.Node)
        .where(orm.Node.id == expired.id)
        .values(deleted_at=now - timedelta(days=45))
    )
    await db_session.execute(
        update(orm.Node)
        .where(orm.Node.id == keep.id)
        .values(deleted_at=now - timedelta(days=2))
    )
    await db_session.commit()

    # Pin "now" via purge_expired_trash path used by run_auto_trash_purge:
    # run_auto_trash_purge uses wall clock, so use a far-past deleted_at above.
    removed = await lib_api.run_auto_trash_purge(db_session)
    assert expired.id in removed

    gone = await db_session.scalar(
        select(orm.Node.id).where(orm.Node.id == expired.id)
    )
    still = await db_session.scalar(
        select(orm.Node.id).where(orm.Node.id == keep.id)
    )
    assert gone is None
    assert still == keep.id


def test_start_trash_purge_scheduler_disabled_when_interval_zero():
    class _Settings:
        papermerge__main__trash_purge_interval_seconds = 0

    with patch.object(scheduler, "get_settings", return_value=_Settings()):
        scheduler._task = None
        scheduler._stop = None
        scheduler.start_trash_purge_scheduler()
        assert scheduler._task is None
