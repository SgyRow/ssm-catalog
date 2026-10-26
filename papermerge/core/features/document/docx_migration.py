"""Backfill PDF preview versions for legacy DOCX uploads."""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from papermerge.core import constants, orm, schema, tasks
from papermerge.core.features.document.db.api import (
    create_next_version,
    get_pdf_page_count,
    populate_embedded_pdf_text,
)
from papermerge.core.features.document.docx_convert import (
    DocxConversionError,
    convert_docx_to_pdf,
    is_legacy_docx_version,
    pdf_companion_name,
)
from papermerge.core.features.document.upload_text import extract_upload_text
from papermerge.core.features.portal.db import api as portal_dbapi
from papermerge.core.pathlib import abs_docver_path
from papermerge.core.utils.misc import copy_file

logger = logging.getLogger(__name__)


def _is_legacy_docx_version(file_name: str | None) -> bool:
    return is_legacy_docx_version(file_name)


def _pdf_companion_name(docx_file_name: str) -> str:
    return pdf_companion_name(docx_file_name)


async def _pdf_companion_exists(
    db_session: AsyncSession, document_id: UUID, docx_file_name: str
) -> bool:
    companion = _pdf_companion_name(docx_file_name)
    stmt = (
        select(orm.DocumentVersion.id)
        .where(
            orm.DocumentVersion.document_id == document_id,
            orm.DocumentVersion.file_name == companion,
        )
        .limit(1)
    )
    return (await db_session.scalars(stmt)).one_or_none() is not None


async def find_docx_versions_needing_migration(
    db_session: AsyncSession,
    *,
    portal_only: bool = True,
    document_ids: list[UUID] | None = None,
) -> list[tuple[UUID, UUID, str]]:
    """
    Return `(document_id, docx_version_id, file_name)` for documents whose
    latest version is a legacy DOCX blob without a derived PDF companion.
    """
    portal_ids: set[UUID] | None = None
    if portal_only:
        root_id = await portal_dbapi.get_portal_root_id(db_session)
        portal_ids = await portal_dbapi.get_portal_subtree_node_ids(
            db_session, root_id
        )
        if not portal_ids:
            return []

    stmt = (
        select(orm.Document)
        .options(selectinload(orm.Document.versions))
        .where(orm.Node.deleted_at.is_(None))
    )
    if document_ids:
        stmt = stmt.where(orm.Document.id.in_(document_ids))
    elif portal_ids is not None:
        stmt = stmt.where(orm.Document.id.in_(portal_ids))

    docs = (await db_session.scalars(stmt)).all()
    candidates: list[tuple[UUID, UUID, str]] = []

    for doc in docs:
        versions = sorted(doc.versions, key=lambda v: v.number)
        if not versions:
            continue
        latest = versions[-1]
        file_name = latest.file_name or ""
        if not _is_legacy_docx_version(file_name):
            continue
        if latest.size <= 0 or not latest.file_path.exists():
            continue
        if await _pdf_companion_exists(db_session, doc.id, file_name):
            continue
        candidates.append((doc.id, latest.id, file_name))

    return candidates


async def append_pdf_preview_for_docx_version(
    db_session: AsyncSession,
    *,
    doc: orm.Document,
    docx_ver: orm.DocumentVersion,
    pdf_content: bytes | None = None,
) -> orm.DocumentVersion:
    """
    Keep an existing DOCX version and append a PDF preview version (same layout
    as fresh DOCX uploads).
    """
    file_name = docx_ver.file_name
    if not file_name or not _is_legacy_docx_version(file_name):
        raise ValueError(f"Not a legacy DOCX version: {file_name!r}")

    docx_path = docx_ver.file_path
    if not docx_path.exists():
        raise FileNotFoundError(str(docx_path))

    raw_content = docx_path.read_bytes()
    if pdf_content is None:
        pdf_content = await convert_docx_to_pdf(raw_content, file_name)

    pdf_ver = await create_next_version(
        db_session,
        doc=doc,
        file_name=_pdf_companion_name(file_name),
        file_size=len(pdf_content),
        short_description="docx -> pdf",
    )
    await copy_file(
        src=pdf_content,
        dst=abs_docver_path(pdf_ver.id, pdf_ver.file_name),
    )

    page_count = get_pdf_page_count(pdf_content)
    docx_ver.page_count = page_count
    pdf_ver.page_count = page_count

    preserved_text = docx_ver.text
    if not preserved_text and docx_ver.pages:
        for page in sorted(docx_ver.pages, key=lambda p: p.number):
            if page.text:
                preserved_text = page.text
                break
    if not preserved_text:
        preserved_text = extract_upload_text(
            content=raw_content,
            file_name=file_name,
            content_type=constants.ContentType.DOCX,
        )

    await db_session.execute(
        delete(orm.Page).where(orm.Page.document_version_id == docx_ver.id)
    )
    await db_session.flush()
    db_session.expire(docx_ver, ["pages"])

    for page_number in range(1, page_count + 1):
        page_text = preserved_text if page_number == 1 else None
        db_session.add(
            orm.Page(
                number=page_number,
                page_count=page_count,
                lang=docx_ver.lang,
                document_version_id=docx_ver.id,
                text=page_text,
            )
        )
        db_session.add(
            orm.Page(
                number=page_number,
                page_count=page_count,
                lang=pdf_ver.lang,
                document_version_id=pdf_ver.id,
            )
        )

    if preserved_text:
        docx_ver.text = preserved_text

    pdf_dst = abs_docver_path(pdf_ver.id, pdf_ver.file_name)
    await populate_embedded_pdf_text(
        db_session=db_session,
        doc=doc,
        doc_ver=pdf_ver,
        pdf_path=str(pdf_dst),
        page_count=page_count,
    )
    return pdf_ver


async def migrate_docx_document_version(
    db_session: AsyncSession,
    document_id: UUID,
    docx_version_id: UUID,
) -> schema.Error | None:
    doc = await db_session.get(
        orm.Document,
        document_id,
        options=(selectinload(orm.Document.versions).selectinload(orm.DocumentVersion.pages),),
    )
    if doc is None:
        return schema.Error(messages=[f"Document {document_id} not found"])

    docx_ver = next((v for v in doc.versions if v.id == docx_version_id), None)
    if docx_ver is None:
        return schema.Error(messages=[f"Document version {docx_version_id} not found"])

    file_name = docx_ver.file_name or ""
    if not _is_legacy_docx_version(file_name):
        return schema.Error(messages=[f"Version is not legacy DOCX: {file_name!r}"])

    if await _pdf_companion_exists(db_session, document_id, file_name):
        return None

    try:
        pdf_ver = await append_pdf_preview_for_docx_version(
            db_session, doc=doc, docx_ver=docx_ver
        )
    except DocxConversionError as exc:
        return schema.Error(messages=[str(exc)])
    except OSError as exc:
        return schema.Error(messages=[str(exc)])
    except Exception as exc:
        logger.exception("DOCX backfill unexpected error doc=%s", document_id)
        return schema.Error(messages=[str(exc)])

    await db_session.commit()

    try:
        tasks.send_task(
            constants.S3_WORKER_ADD_DOC_VER,
            kwargs={"doc_ver_ids": [str(pdf_ver.id)]},
            route_name="s3",
        )
        tasks.send_task(
            constants.INDEX_ADD_NODE,
            kwargs={"node_id": str(document_id)},
            route_name="i3",
        )
    except Exception:
        logger.warning(
            "DOCX backfill: post-commit tasks skipped for doc=%s (is Redis up?)",
            document_id,
            exc_info=True,
        )
    return None


async def migrate_docx_candidates(
    db_session: AsyncSession,
    candidates: list[tuple[UUID, UUID, str]],
) -> tuple[int, int, list[str]]:
    converted = 0
    failed = 0
    errors: list[str] = []

    for document_id, docx_version_id, file_name in candidates:
        error = await migrate_docx_document_version(
            db_session, document_id, docx_version_id
        )
        if error is None:
            converted += 1
            logger.info(
                "DOCX backfill OK doc=%s version=%s file=%s",
                document_id,
                docx_version_id,
                file_name,
            )
        else:
            failed += 1
            msg = f"{file_name} ({document_id}): {', '.join(error.messages)}"
            errors.append(msg)
            logger.warning("DOCX backfill failed %s", msg)
            await db_session.rollback()

    return converted, failed, errors
