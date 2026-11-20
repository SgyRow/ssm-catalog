"""Reorganize central NPA registry into type subfolders and rebind measures.

Physical layout::

    Нормативные правовые акты/
      Федеральные/{type}/...
      Региональные/{type}/...

Measure virtual folders become ``{Bucket} — {Type}`` and links are moved
onto those folders. Document node ids stay unchanged (links keep working
across physical moves).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core.features.msp import folder_template
from papermerge.core.features.msp.db import api as msp_api
from papermerge.core.features.msp.db import orm as msp_orm
from papermerge.core.features.msp.npa_classify import (
    classify_type,
    match_existing_type,
    parse_virtual_folder_title,
    virtual_folder_title,
)
from papermerge.core.features.nodes.db import api as nodes_dbapi
from papermerge.core.features.nodes.db import orm as nodes_orm
from papermerge.core.features.nodes.db.node_titles import next_sort_index

logger = logging.getLogger(__name__)


@dataclass
class ReorgReport:
    moved: list[str] = field(default_factory=list)
    already_typed: int = 0
    created_type_folders: list[str] = field(default_factory=list)
    rebound_links: int = 0
    created_virtual: list[str] = field(default_factory=list)
    deleted_virtual: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


async def _children(
    db_session: AsyncSession, parent_id: UUID
) -> list[nodes_orm.Node]:
    stmt = (
        select(nodes_orm.Node)
        .where(
            nodes_orm.Node.parent_id == parent_id,
            nodes_orm.Node.deleted_at.is_(None),
        )
        .order_by(nodes_orm.Node.sort_index, nodes_orm.Node.title)
    )
    return list((await db_session.execute(stmt)).scalars().all())


async def _ensure_type_folder(
    db_session: AsyncSession,
    *,
    bucket_id: UUID,
    title: str,
    group_id: UUID | None,
    user_id: UUID | None,
) -> UUID:
    kids = await _children(db_session, bucket_id)
    for kid in kids:
        if kid.ctype == "folder" and kid.title == title:
            return kid.id
    return await msp_api._get_or_create_owned_folder(
        db_session,
        parent_id=bucket_id,
        title=title,
        group_id=group_id,
        user_id=user_id,
    )


async def reorganize_registry(
    db_session: AsyncSession, *, dry_run: bool = True
) -> ReorgReport:
    """Move loose docs under Федеральные/Региональные into type subfolders."""
    report = ReorgReport()
    registry_id, buckets, err = await msp_api.ensure_normative_registry(db_session)
    if err or registry_id is None:
        report.errors.append(err or "registry_missing")
        return report

    bucket_row = (
        await db_session.execute(
            select(nodes_orm.Node.group_id, nodes_orm.Node.user_id).where(
                nodes_orm.Node.id == registry_id
            )
        )
    ).one()
    group_id, user_id = bucket_row

    for bucket_title, bucket_id in buckets.items():
        kids = await _children(db_session, bucket_id)
        existing_type_titles = [
            k.title for k in kids if k.ctype == "folder"
        ]
        type_ids: dict[str, UUID] = {
            k.title: k.id for k in kids if k.ctype == "folder"
        }
        real_type_ids = set(type_ids.values())

        for node in kids:
            if node.ctype == "folder":
                # Already a type folder — count docs inside as typed
                nested = await _children(db_session, node.id)
                report.already_typed += sum(
                    1 for n in nested if n.ctype == "document"
                )
                continue
            if node.ctype != "document":
                continue

            preferred = classify_type(node.title, bucket=bucket_title)
            matched = match_existing_type(preferred, existing_type_titles)
            target_title = matched or preferred

            if target_title not in type_ids:
                report.created_type_folders.append(
                    f"{bucket_title}/{target_title}"
                )
                if dry_run:
                    # Placeholder so later docs share the same planned folder.
                    type_ids[target_title] = node.id
                    existing_type_titles.append(target_title)
                else:
                    tid = await _ensure_type_folder(
                        db_session,
                        bucket_id=bucket_id,
                        title=target_title,
                        group_id=group_id,
                        user_id=user_id,
                    )
                    type_ids[target_title] = tid
                    existing_type_titles.append(target_title)

            target_id = type_ids[target_title]
            label = f"{bucket_title}/{target_title}/{node.title}"
            if dry_run:
                if target_id in real_type_ids:
                    target_kids = [
                        k.title
                        for k in await _children(db_session, target_id)
                        if k.id != node.id
                    ]
                    if node.title in target_kids:
                        report.skipped.append(f"title_clash:{label}")
                        continue
                report.moved.append(label)
                continue
            try:
                # Avoid unique(parent_id, title) collisions with an
                # already-categorized copy of the same act.
                clash = (
                    await db_session.execute(
                        select(nodes_orm.Node.id).where(
                            nodes_orm.Node.parent_id == target_id,
                            nodes_orm.Node.title == node.title,
                            nodes_orm.Node.deleted_at.is_(None),
                            nodes_orm.Node.id != node.id,
                        )
                    )
                ).scalar_one_or_none()
                new_title = node.title
                if clash is not None:
                    stem, dot, ext = node.title.rpartition(".")
                    if not stem:
                        stem, ext, dot = node.title, "", ""
                    # Drop a previous failed "(дубликат)" suffix before retry.
                    if stem.endswith(" (дубликат)"):
                        stem = stem[: -len(" (дубликат)")]
                    base = f"{stem} (дубликат)"
                    candidate = f"{base}{dot}{ext}"
                    n = 2
                    while True:
                        exists = (
                            await db_session.execute(
                                select(nodes_orm.Node.id).where(
                                    nodes_orm.Node.parent_id == target_id,
                                    nodes_orm.Node.title == candidate,
                                    nodes_orm.Node.deleted_at.is_(None),
                                )
                            )
                        ).scalar_one_or_none()
                        if exists is None:
                            break
                        candidate = f"{base} {n}{dot}{ext}"
                        n += 1
                    await db_session.execute(
                        update(nodes_orm.Node)
                        .where(nodes_orm.Node.id == node.id)
                        .values(title=candidate)
                    )
                    new_title = candidate
                    label = f"{bucket_title}/{target_title}/{new_title}"

                await nodes_dbapi.move_nodes(
                    db_session, source_ids=[node.id], target_id=target_id
                )
                await db_session.execute(
                    update(nodes_orm.Node)
                    .where(nodes_orm.Node.id == node.id)
                    .values(
                        sort_index=await next_sort_index(db_session, target_id)
                    )
                )
                await db_session.commit()
                report.moved.append(label)
            except Exception as exc:  # noqa: BLE001
                report.errors.append(f"{node.title}: {exc}")
                await db_session.rollback()

    if not dry_run:
        await db_session.flush()
    return report


async def _doc_bucket_and_type(
    db_session: AsyncSession,
    document_id: UUID,
    registry_id: UUID,
    bucket_ids: dict[str, UUID],
) -> tuple[str | None, str | None]:
    """Resolve (bucket_title, type_title) for a registry document."""
    node = await db_session.get(nodes_orm.Node, document_id)
    if node is None or node.deleted_at is not None:
        return None, None
    parent = await db_session.get(nodes_orm.Node, node.parent_id)
    if parent is None:
        return None, None

    id_to_bucket = {vid: title for title, vid in bucket_ids.items()}

    # Doc directly under bucket (should not happen after reorg)
    if parent.id in id_to_bucket:
        bucket = id_to_bucket[parent.id]
        return bucket, classify_type(node.title, bucket=bucket)

    # Doc under type folder under bucket
    grand = (
        await db_session.get(nodes_orm.Node, parent.parent_id)
        if parent.parent_id
        else None
    )
    if grand is not None and grand.id in id_to_bucket:
        return id_to_bucket[grand.id], parent.title

    # Walk up to find bucket
    cur = parent
    chain = [cur]
    for _ in range(6):
        if cur.id in id_to_bucket:
            bucket = id_to_bucket[cur.id]
            # type is the child of bucket in the chain
            if len(chain) >= 2:
                return bucket, chain[-2].title
            return bucket, classify_type(node.title, bucket=bucket)
        if cur.parent_id is None or cur.id == registry_id:
            break
        cur = await db_session.get(nodes_orm.Node, cur.parent_id)
        if cur is None:
            break
        chain.append(cur)

    return None, None


async def rebind_measure_folders(
    db_session: AsyncSession, *, dry_run: bool = True
) -> ReorgReport:
    """Rebuild virtual normative folders as ``Bucket — Type`` and move links.

    Link ``folder_id`` is updated via bulk SQL (not ORM attribute assignment)
    so SQLAlchemy ``delete-orphan`` on folder.links cannot wipe the links
    when they leave the old collection.
    """
    report = ReorgReport()
    registry_id, buckets, err = await msp_api.ensure_normative_registry(db_session)
    if err or registry_id is None:
        report.errors.append(err or "registry_missing")
        return report

    msps = await msp_api.list_msps(db_session)
    for msp in msps:
        # Plain SELECTs — do not load folder.links collections.
        folders = list(
            (
                await db_session.execute(
                    select(msp_orm.MspNormativeFolder).where(
                        msp_orm.MspNormativeFolder.msp_id == msp.id
                    )
                )
            )
            .scalars()
            .all()
        )
        link_rows = list(
            (
                await db_session.execute(
                    select(
                        msp_orm.MspNormativeLink.id,
                        msp_orm.MspNormativeLink.document_id,
                        msp_orm.MspNormativeLink.folder_id,
                    ).where(msp_orm.MspNormativeLink.msp_id == msp.id)
                )
            ).all()
        )

        desired: dict[UUID, str] = {}  # link_id -> virtual title
        for link_id, document_id, _folder_id in link_rows:
            bucket, typ = await _doc_bucket_and_type(
                db_session, document_id, registry_id, buckets
            )
            if not bucket or not typ:
                report.skipped.append(str(document_id))
                continue
            desired[link_id] = virtual_folder_title(bucket, typ)

        needed_titles = sorted(set(desired.values()))
        title_to_folder: dict[str, msp_orm.MspNormativeFolder] = {
            f.title: f for f in folders
        }

        sort_i = max((f.sort_order for f in folders), default=-1) + 1
        for title in needed_titles:
            if title in title_to_folder:
                continue
            report.created_virtual.append(title)
            if dry_run:
                continue
            folder = msp_orm.MspNormativeFolder(
                msp_id=msp.id, title=title, sort_order=sort_i
            )
            db_session.add(folder)
            await db_session.flush()
            title_to_folder[title] = folder
            sort_i += 1

        # Bulk-reassign folder_id via SQL to avoid delete-orphan side effects.
        for link_id, _document_id, folder_id in link_rows:
            vtitle = desired.get(link_id)
            if not vtitle:
                continue
            target = title_to_folder.get(vtitle)
            if target is None:
                if dry_run:
                    report.rebound_links += 1
                continue
            if folder_id == target.id:
                continue
            report.rebound_links += 1
            if not dry_run:
                await db_session.execute(
                    update(msp_orm.MspNormativeLink)
                    .where(msp_orm.MspNormativeLink.id == link_id)
                    .values(folder_id=target.id)
                )

        if not dry_run:
            await db_session.flush()
            still_needed = set(desired.values())
            # Delete only folders that truly have zero links (SQL, not ORM
            # cascade through relationship collections).
            empty_stmt = select(
                msp_orm.MspNormativeFolder.id,
                msp_orm.MspNormativeFolder.title,
            ).where(msp_orm.MspNormativeFolder.msp_id == msp.id)
            if still_needed:
                empty_stmt = empty_stmt.where(
                    msp_orm.MspNormativeFolder.title.not_in(still_needed)
                )
            linked_folder_ids = select(msp_orm.MspNormativeLink.folder_id).where(
                msp_orm.MspNormativeLink.msp_id == msp.id
            )
            empty_stmt = empty_stmt.where(
                ~msp_orm.MspNormativeFolder.id.in_(linked_folder_ids)
            )
            empty_ids = (await db_session.execute(empty_stmt)).all()
            for fid, ftitle in empty_ids:
                report.deleted_virtual.append(ftitle)
                await db_session.execute(
                    msp_orm.MspNormativeFolder.__table__.delete().where(
                        msp_orm.MspNormativeFolder.id == fid
                    )
                )

            folders = list(
                (
                    await db_session.execute(
                        select(msp_orm.MspNormativeFolder).where(
                            msp_orm.MspNormativeFolder.msp_id == msp.id
                        )
                    )
                )
                .scalars()
                .all()
            )

            def sort_key(f: msp_orm.MspNormativeFolder) -> tuple:
                b, t = parse_virtual_folder_title(f.title)
                bucket_ord = (
                    0 if b == folder_template.NORMATIVE_BUCKET_FEDERAL else 1
                )
                return (bucket_ord, t or f.title)

            for i, folder in enumerate(sorted(folders, key=sort_key)):
                folder.sort_order = i

    if not dry_run:
        await db_session.flush()
    return report


async def run_full_reorg(
    db_session: AsyncSession, *, dry_run: bool = True
) -> tuple[ReorgReport, ReorgReport]:
    phys = await reorganize_registry(db_session, dry_run=dry_run)
    # Physical moves commit per-document; continue rebind even if some
    # individual moves failed (reported in phys.errors).
    virt = await rebind_measure_folders(db_session, dry_run=dry_run)
    if not dry_run:
        await db_session.commit()
    return phys, virt
