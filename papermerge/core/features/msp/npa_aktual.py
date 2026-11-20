"""Deduplicate NPA registry editions and report актуализация candidates.

For each act identity (bucket+type+number+date) keep the newest edition
(prefer ``ред. от``), re-point ``msp_normative_links`` to the keeper, then
soft-delete the retired document nodes.
"""

from __future__ import annotations

import logging
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core.features.msp import folder_template
from papermerge.core.features.msp.db import api as msp_api
from papermerge.core.features.msp.db import orm as msp_orm
from papermerge.core.features.msp.npa_classify import classify_type
from papermerge.core.features.nodes.db import orm as nodes_orm

logger = logging.getLogger(__name__)

_DATE_RE = re.compile(
    r"(?:от\s+)?(\d{1,2})[.\s]+(\d{1,2}|января|февраля|марта|апреля|мая|июня|"
    r"июля|августа|сентября|октября|ноября|декабря)[.\s]+(\d{4})",
    re.I,
)
_NUM_RE = re.compile(
    r"(?:№|N|No\.?)\s*([0-9]+(?:-[а-яА-Яa-zA-Z]+)?)|"
    r"(\d+)\s*-?\s*(фз|пр|п)\b",
    re.I,
)
_RED_RE = re.compile(
    r"\(?\s*ред\.?\s*от\s+(\d{1,2})[./](\d{1,2})[./](\d{4})",
    re.I,
)
_MONTHS = {
    "января": 1,
    "февраля": 2,
    "марта": 3,
    "апреля": 4,
    "мая": 5,
    "июня": 6,
    "июля": 7,
    "августа": 8,
    "сентября": 9,
    "октября": 10,
    "ноября": 11,
    "декабря": 12,
}


@dataclass
class AktualReport:
    groups: int = 0
    kept: int = 0
    retired: int = 0
    links_repointed: int = 0
    skipped_unique: int = 0
    skipped_ambiguous: list[str] = field(default_factory=list)
    retired_titles: list[str] = field(default_factory=list)
    keep_titles: list[str] = field(default_factory=list)
    check_candidates: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def _parse_date(m) -> str | None:
    if not m:
        return None
    d, mon, y = m.group(1), m.group(2), m.group(3)
    if mon.isdigit():
        month = int(mon)
    else:
        month = _MONTHS.get(mon.casefold())
        if not month:
            return None
    try:
        return f"{int(y):04d}-{month:02d}-{int(d):02d}"
    except ValueError:
        return None


def act_identity(title: str, bucket: str, typ: str) -> str | None:
    """Stable key for an act, or None if too ambiguous to merge."""
    t = title or ""
    red = _parse_date(_RED_RE.search(t))
    t2 = _RED_RE.sub("", t)
    t2 = re.sub(r"\(ст\.[^)]*\)", "", t2, flags=re.I)
    t2 = re.sub(r"\(статья[^)]*\)", "", t2, flags=re.I)
    t2 = re.sub(r"статья\s+\d+[^.]*", "", t2, flags=re.I)
    t2 = re.sub(r"пункт\s+\d+[^.]*", "", t2, flags=re.I)
    t2 = re.sub(r"часть\s+\d+[^.]*", "", t2, flags=re.I)
    t2 = re.sub(r"\s*\(дубликат\)(?:\s*\d+)?", "", t2, flags=re.I)

    num_m = _NUM_RE.search(t2)
    num = None
    if num_m:
        num = (num_m.group(1) or num_m.group(2) or "").casefold()
        if num_m.group(3):
            num = f"{num}-{num_m.group(3).casefold()}"
    date = _parse_date(_DATE_RE.search(t2))
    if not num or not date:
        return None  # never merge unknowns
    return f"{bucket}|{typ}|{num}|{date}"


def _rank_key(title: str, link_count: int) -> tuple:
    red = _parse_date(_RED_RE.search(title or "")) or ""
    is_dup = 0 if "дубликат" in (title or "").casefold() else 1
    is_excerpt = (
        0
        if (
            "ст." in (title or "").casefold()
            or "статья" in (title or "").casefold()
            or "пункт" in (title or "").casefold()
        )
        else 1
    )
    return (red, is_dup, is_excerpt, link_count, len(title or ""))


async def _children(db_session: AsyncSession, parent_id: UUID):
    stmt = (
        select(nodes_orm.Node)
        .where(
            nodes_orm.Node.parent_id == parent_id,
            nodes_orm.Node.deleted_at.is_(None),
        )
        .order_by(nodes_orm.Node.title)
    )
    return list((await db_session.execute(stmt)).scalars().all())


async def dedupe_editions(
    db_session: AsyncSession, *, dry_run: bool = True
) -> AktualReport:
    report = AktualReport()
    registry_id, buckets, err = await msp_api.ensure_normative_registry(db_session)
    if err or registry_id is None:
        report.errors.append(err or "registry_missing")
        return report

    # Collect all registry documents with path context
    groups: dict[str, list[tuple[UUID, str, int]]] = defaultdict(list)
    # id -> (title, bucket, typ)
    singles: list[tuple[UUID, str, str, str]] = []

    for bucket_title, bucket_id in buckets.items():
        type_folders = [
            n for n in await _children(db_session, bucket_id) if n.ctype == "folder"
        ]
        for tf in type_folders:
            docs = [
                n for n in await _children(db_session, tf.id) if n.ctype == "document"
            ]
            for doc in docs:
                link_count = (
                    await db_session.execute(
                        select(func.count())
                        .select_from(msp_orm.MspNormativeLink)
                        .where(msp_orm.MspNormativeLink.document_id == doc.id)
                    )
                ).scalar_one()
                key = act_identity(doc.title, bucket_title, tf.title)
                if key is None:
                    report.skipped_ambiguous.append(doc.title)
                    singles.append((doc.id, doc.title, bucket_title, tf.title))
                    continue
                groups[key].append((doc.id, doc.title, int(link_count)))

    report.groups = len(groups)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    for key, items in groups.items():
        if len(items) == 1:
            report.kept += 1
            report.skipped_unique += 1
            doc_id, title, _lc = items[0]
            report.keep_titles.append(title)
            # Flag for external check if no ред. от or old
            red = _parse_date(_RED_RE.search(title))
            if not red or red < "2024-01-01":
                report.check_candidates.append(title)
            continue

        ranked = sorted(items, key=lambda x: _rank_key(x[1], x[2]), reverse=True)
        keep_id, keep_title, _ = ranked[0]
        report.kept += 1
        report.keep_titles.append(keep_title)
        red = _parse_date(_RED_RE.search(keep_title))
        if not red or red < "2024-01-01":
            report.check_candidates.append(keep_title)

        for retire_id, retire_title, _lc in ranked[1:]:
            report.retired += 1
            report.retired_titles.append(retire_title)
            if dry_run:
                # Count links that would move
                nlinks = (
                    await db_session.execute(
                        select(func.count())
                        .select_from(msp_orm.MspNormativeLink)
                        .where(msp_orm.MspNormativeLink.document_id == retire_id)
                    )
                ).scalar_one()
                report.links_repointed += int(nlinks)
                continue

            # Re-point links; skip if keep already linked on same msp
            links = list(
                (
                    await db_session.execute(
                        select(msp_orm.MspNormativeLink).where(
                            msp_orm.MspNormativeLink.document_id == retire_id
                        )
                    )
                )
                .scalars()
                .all()
            )
            for link in links:
                exists = (
                    await db_session.execute(
                        select(msp_orm.MspNormativeLink.id).where(
                            msp_orm.MspNormativeLink.msp_id == link.msp_id,
                            msp_orm.MspNormativeLink.document_id == keep_id,
                        )
                    )
                ).scalar_one_or_none()
                if exists is not None:
                    await db_session.execute(
                        msp_orm.MspNormativeLink.__table__.delete().where(
                            msp_orm.MspNormativeLink.id == link.id
                        )
                    )
                else:
                    await db_session.execute(
                        update(msp_orm.MspNormativeLink)
                        .where(msp_orm.MspNormativeLink.id == link.id)
                        .values(document_id=keep_id)
                    )
                    report.links_repointed += 1

            await db_session.execute(
                update(nodes_orm.Node)
                .where(nodes_orm.Node.id == retire_id)
                .values(deleted_at=now)
            )

    # Ambiguous singles also go to check list
    for _id, title, _b, _t in singles:
        report.check_candidates.append(title)

    if not dry_run:
        await db_session.commit()
    return report
