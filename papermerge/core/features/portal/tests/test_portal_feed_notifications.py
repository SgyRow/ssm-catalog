"""Portal feed publish creates user notifications for feed viewers."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import orm
from papermerge.core.features.auth.scopes import Scopes
from papermerge.core.features.library_ts.db import api as lib_ts_api
from papermerge.core.features.library_ts.db.orm import UserNotification
from papermerge.core.features.portal.db import api as portal_dbapi
from papermerge.core.features.roles.db import api as roles_dbapi
from papermerge.core.features.users.db import api as users_dbapi


@pytest.mark.asyncio
async def test_portal_feed_publish_notifies_viewers(
    db_session: AsyncSession,
    make_user,
    make_role,
):
    await roles_dbapi.sync_perms(db_session)
    await db_session.commit()

    feed_viewer_role = await make_role(
        "feed_viewer", scopes=[Scopes.PORTAL_FEED_VIEW]
    )
    feed_manager_role = await make_role(
        "feed_manager",
        scopes=[Scopes.PORTAL_FEED_VIEW, Scopes.PORTAL_FEED_MANAGE],
    )

    author = await make_user("feed_author", is_superuser=False)
    viewer = await make_user("feed_reader", is_superuser=False)
    outsider = await make_user("no_feed", is_superuser=False)

    await users_dbapi.attach_user_roles_by_names(
        db_session, author.id, [feed_manager_role.name]
    )
    await users_dbapi.attach_user_roles_by_names(
        db_session, viewer.id, [feed_viewer_role.name]
    )
    await db_session.commit()

    row = await portal_dbapi.create_portal_news(
        db_session,
        user_id=author.id,
        title="Важное объявление",
        body="Текст новости",
        attachment_node_ids=[],
    )
    await lib_ts_api.notify_users_portal_feed_published(
        db_session,
        news_id=row["id"],
        title=row["title"],
        author_id=author.id,
        author_username=row["author_username"],
    )
    await db_session.commit()

    rows = (
        await db_session.scalars(
            select(UserNotification).where(
                UserNotification.kind == lib_ts_api.PORTAL_FEED_PUBLISHED_KIND
            )
        )
    ).all()
    notified_user_ids = {n.user_id for n in rows}

    assert viewer.id in notified_user_ids
    assert author.id not in notified_user_ids
    assert outsider.id not in notified_user_ids
    assert len(rows) == 1
