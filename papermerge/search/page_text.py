import uuid

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import orm
from papermerge.core.features.document.upload_text import extract_text_from_file
from papermerge.core.pathlib import abs_docver_path


async def resolve_page_search_text(
    db_session: AsyncSession,
    *,
    page_id: uuid.UUID,
    doc_ver: orm.DocumentVersion,
    current_text: str | None,
) -> str | None:
    """Return page text for search, extracting from disk and persisting when missing."""
    if current_text and current_text.strip():
        return current_text

    file_name = doc_ver.file_name or ""
    text = extract_text_from_file(
        file_path=abs_docver_path(doc_ver.id, file_name),
        file_name=file_name,
        content_type=doc_ver.short_description,
    )
    if not text:
        return None

    await db_session.execute(
        update(orm.Page).where(orm.Page.id == page_id).values(text=text)
    )
    await db_session.execute(
        update(orm.DocumentVersion)
        .where(orm.DocumentVersion.id == doc_ver.id)
        .values(text=text)
    )
    await db_session.commit()
    return text
