"""Tests for МСП folder template creation."""

from datetime import datetime

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import orm
from papermerge.core.features.library_ts.msp_folder_template import (
    MSP_FOLDER_TEMPLATE,
    create_msp_folder_tree,
)


def _count_specs(nodes: list) -> int:
    total = 0
    for _title, children in nodes:
        total += 1
        if children:
            total += _count_specs(children)
    return total


EXPECTED_TEMPLATE_FOLDER_COUNT = _count_specs(MSP_FOLDER_TEMPLATE) + 1


@pytest.mark.asyncio
async def test_create_msp_folder_tree(
    db_session: AsyncSession, make_user, make_folder
):
    user = await make_user("msp_owner")
    parent = user.home_folder

    root, created_ids, error = await create_msp_folder_tree(
        db_session,
        parent_id=parent.id,
        title="Тестовая МСП",
    )

    assert error is None, error
    assert root is not None
    await db_session.commit()
    assert root.title == "Тестовая МСП"
    assert len(created_ids) == EXPECTED_TEMPLATE_FOLDER_COUNT

    count_stmt = (
        select(func.count())
        .select_from(orm.Folder)
        .where(orm.Folder.parent_id == root.id)
    )
    top_level_count = await db_session.scalar(count_stmt)
    assert top_level_count == len(MSP_FOLDER_TEMPLATE)

    nested_stmt = (
        select(func.count())
        .select_from(orm.Folder)
        .where(orm.Folder.title == "Федеральные")
    )
    assert (await db_session.scalar(nested_stmt)) == 1


@pytest.mark.asyncio
async def test_create_msp_folder_tree_resumes_existing_root(
    db_session: AsyncSession, make_user
):
    user = await make_user("msp_resume")
    parent = user.home_folder

    root, created_ids, error = await create_msp_folder_tree(
        db_session,
        parent_id=parent.id,
        title="Возобновляемая МСП",
    )
    assert error is None
    assert root is not None
    await db_session.commit()

    # Simulate a previous partial run: only the root folder exists.
    for child_id in created_ids[1:]:
        child = await db_session.get(orm.Folder, child_id)
        await db_session.delete(child)
    await db_session.commit()

    resumed, resumed_ids, resume_error = await create_msp_folder_tree(
        db_session,
        parent_id=parent.id,
        title="Возобновляемая МСП",
    )
    assert resume_error is None, resume_error
    assert resumed is not None
    await db_session.commit()

    assert len(resumed_ids) == EXPECTED_TEMPLATE_FOLDER_COUNT
    top_level_count = await db_session.scalar(
        select(func.count())
        .select_from(orm.Folder)
        .where(orm.Folder.parent_id == resumed.id)
    )
    assert top_level_count == len(MSP_FOLDER_TEMPLATE)


@pytest.mark.asyncio
async def test_create_msp_folder_tree_after_soft_delete(
    db_session: AsyncSession, make_user
):
    user = await make_user("msp_trash")
    parent = user.home_folder
    title = "МСП после удаления"

    root, _, error = await create_msp_folder_tree(
        db_session,
        parent_id=parent.id,
        title=title,
    )
    assert error is None
    assert root is not None
    await db_session.commit()

    await db_session.execute(
        update(orm.Node)
        .where(orm.Node.id == root.id)
        .values(deleted_at=datetime.utcnow())
    )
    await db_session.commit()

    revived, revived_ids, revive_error = await create_msp_folder_tree(
        db_session,
        parent_id=parent.id,
        title=title,
    )
    assert revive_error is None, revive_error
    assert revived is not None
    assert revived.id == root.id
    await db_session.commit()

    row = await db_session.get(orm.Folder, root.id)
    assert row is not None
    assert row.deleted_at is None
    assert len(revived_ids) == EXPECTED_TEMPLATE_FOLDER_COUNT
