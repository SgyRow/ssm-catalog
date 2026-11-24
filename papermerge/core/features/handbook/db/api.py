import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import orm
from papermerge.core.config import get_settings
from papermerge.core.features.handbook.db import orm as hb_orm
from papermerge.core.features.handbook.sanitize import sanitize_html
from papermerge.core.features.users.schema import user_display_name

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")

# Storage name of the single file that makes up a "file" handbook item.
DOC_STORAGE_NAME = "document"


def _article_dir(article_id: UUID) -> Path:
    root = get_settings().papermerge__main__media_root
    path = Path(root) / "handbook" / str(article_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _article_file_path(article_id: UUID) -> Path:
    root = get_settings().papermerge__main__media_root
    return Path(root) / "handbook" / str(article_id) / DOC_STORAGE_NAME


def _file_dict(article: hb_orm.HandbookArticle) -> dict | None:
    if article.kind != "file":
        return None
    # Cache-bust so replace swaps the preview/download URL even when the
    # path stays /documents/{id}/download (browsers and the SPA both cache).
    # Milliseconds: second resolution collides when create+replace share a second.
    stamp = ""
    if article.updated_at is not None:
        stamp = str(int(article.updated_at.timestamp() * 1000))
    url = f"/api/handbook/documents/{article.id}/download"
    if stamp:
        url = f"{url}?v={stamp}"
    return {
        "filename": article.file_filename or article.title,
        "content_type": article.file_content_type or "application/octet-stream",
        "size_bytes": article.file_size_bytes or 0,
        "url": url,
    }


def _safe_filename(name: str) -> str:
    base = Path(name or "file").name
    cleaned = _SAFE_NAME.sub("_", base).strip("._")
    return cleaned[:180] or "file"


def title_from_filename(filename: str) -> str:
    """Display title without the last extension segment (keep storage name intact)."""
    stem = Path(filename or "").stem.strip()
    return stem or (filename or "file").strip() or "file"


def _folder_dict(folder: hb_orm.HandbookFolder) -> dict:
    return {
        "id": folder.id,
        "title": folder.title,
        "sort_order": folder.sort_order,
        "created_at": folder.created_at,
        "updated_at": folder.updated_at,
    }


def _author_label(
    username: str | None, first_name: str | None, last_name: str | None
) -> str:
    if not username:
        return ""
    return user_display_name(first_name, last_name, username)


def _article_dict(article: hb_orm.HandbookArticle, author_label: str | None) -> dict:
    return {
        "id": article.id,
        "title": article.title,
        "body": article.body,
        "author_id": article.author_id,
        "author_username": author_label or "",
        "created_at": article.created_at,
        "updated_at": article.updated_at,
        "kind": article.kind,
        "file": _file_dict(article),
        "folder_id": article.folder_id,
    }


async def _ensure_folder(
    db_session: AsyncSession, folder_id: UUID | None
) -> str | None:
    if folder_id is None:
        return None
    folder = await db_session.get(hb_orm.HandbookFolder, folder_id)
    if folder is None:
        return "folder_not_found"
    return None


async def list_folders(db_session: AsyncSession) -> list[dict]:
    stmt = select(hb_orm.HandbookFolder).order_by(
        hb_orm.HandbookFolder.sort_order,
        hb_orm.HandbookFolder.title,
    )
    folders = (await db_session.execute(stmt)).scalars().all()
    return [_folder_dict(folder) for folder in folders]


async def create_folder(
    db_session: AsyncSession, *, title: str
) -> tuple[dict | None, str | None]:
    title = title.strip()
    if not title:
        return None, "invalid_title"
    dup = (
        await db_session.execute(
            select(hb_orm.HandbookFolder).where(
                hb_orm.HandbookFolder.title == title
            )
        )
    ).scalar_one_or_none()
    if dup is not None:
        return None, "duplicate_title"
    max_order = (
        await db_session.execute(
            select(func.coalesce(func.max(hb_orm.HandbookFolder.sort_order), -1))
        )
    ).scalar_one()
    folder = hb_orm.HandbookFolder(title=title, sort_order=int(max_order) + 1)
    db_session.add(folder)
    await db_session.flush()
    await db_session.refresh(folder)
    return _folder_dict(folder), None


async def update_folder(
    db_session: AsyncSession, folder_id: UUID, *, title: str
) -> tuple[dict | None, str | None]:
    title = title.strip()
    if not title:
        return None, "invalid_title"
    folder = await db_session.get(hb_orm.HandbookFolder, folder_id)
    if folder is None:
        return None, "folder_not_found"
    dup = (
        await db_session.execute(
            select(hb_orm.HandbookFolder).where(
                hb_orm.HandbookFolder.title == title,
                hb_orm.HandbookFolder.id != folder_id,
            )
        )
    ).scalar_one_or_none()
    if dup is not None:
        return None, "duplicate_title"
    folder.title = title
    await db_session.flush()
    await db_session.refresh(folder)
    return _folder_dict(folder), None


async def delete_folder(db_session: AsyncSession, folder_id: UUID) -> bool:
    folder = await db_session.get(hb_orm.HandbookFolder, folder_id)
    if folder is None:
        return False
    await db_session.delete(folder)
    await db_session.flush()
    return True


async def list_articles(db_session: AsyncSession) -> list[dict]:
    author = orm.User
    stmt = (
        select(
            hb_orm.HandbookArticle,
            author.username,
            author.first_name,
            author.last_name,
        )
        .outerjoin(author, author.id == hb_orm.HandbookArticle.author_id)
        .order_by(hb_orm.HandbookArticle.updated_at.desc())
    )
    rows = (await db_session.execute(stmt)).all()
    return [
        _article_dict(article, _author_label(username, first_name, last_name))
        for article, username, first_name, last_name in rows
    ]


async def get_article(db_session: AsyncSession, article_id: UUID) -> dict | None:
    author = orm.User
    stmt = (
        select(
            hb_orm.HandbookArticle,
            author.username,
            author.first_name,
            author.last_name,
        )
        .outerjoin(author, author.id == hb_orm.HandbookArticle.author_id)
        .where(hb_orm.HandbookArticle.id == article_id)
    )
    row = (await db_session.execute(stmt)).one_or_none()
    if row is None:
        return None
    article, username, first_name, last_name = row
    return _article_dict(article, _author_label(username, first_name, last_name))


async def create_file_document(
    db_session: AsyncSession,
    *,
    title: str,
    author_id: UUID | None,
    filename: str,
    content_type: str,
    data: bytes,
    folder_id: UUID | None = None,
) -> tuple[dict | None, str | None]:
    err = await _ensure_folder(db_session, folder_id)
    if err:
        return None, err
    article = hb_orm.HandbookArticle(
        title=title,
        body="",
        kind="file",
        author_id=author_id,
        folder_id=folder_id,
        file_filename=filename,
        file_content_type=content_type or "application/octet-stream",
        file_size_bytes=len(data),
    )
    db_session.add(article)
    await db_session.flush()
    path = _article_dir(article.id) / DOC_STORAGE_NAME
    path.write_bytes(data)
    row = await get_article(db_session, article.id)
    if row is None:
        raise RuntimeError("handbook file document was not stored")
    return row, None


async def replace_file_document(
    db_session: AsyncSession,
    article_id: UUID,
    *,
    filename: str,
    content_type: str,
    data: bytes,
) -> dict | None:
    article = await db_session.get(hb_orm.HandbookArticle, article_id)
    if article is None or article.kind != "file":
        return None
    path = _article_dir(article_id) / DOC_STORAGE_NAME
    if path.exists():
        path.unlink()
    path.write_bytes(data)
    article.file_filename = filename
    article.file_content_type = content_type or "application/octet-stream"
    article.file_size_bytes = len(data)
    # Always bump updated_at: same name/size leaves the ORM "clean" and
    # onupdate would not run, so the download URL stamp would stay stale.
    # Use wall-clock time — Postgres now()/func.now() is fixed for the
    # whole transaction and would match create_file_document's stamp.
    article.updated_at = datetime.now(timezone.utc)
    await db_session.flush()
    return await get_article(db_session, article_id)


async def get_file_document(
    db_session: AsyncSession, article_id: UUID
) -> tuple[hb_orm.HandbookArticle, Path] | None:
    article = await db_session.get(hb_orm.HandbookArticle, article_id)
    if article is None or article.kind != "file":
        return None
    path = _article_file_path(article_id)
    if not path.exists():
        return None
    return article, path


async def create_article(
    db_session: AsyncSession,
    *,
    title: str,
    body: str,
    author_id: UUID | None,
    folder_id: UUID | None = None,
) -> tuple[dict | None, str | None]:
    err = await _ensure_folder(db_session, folder_id)
    if err:
        return None, err
    article = hb_orm.HandbookArticle(
        title=title,
        body=sanitize_html(body),
        author_id=author_id,
        folder_id=folder_id,
    )
    db_session.add(article)
    await db_session.flush()
    row = await get_article(db_session, article.id)
    if row is None:
        raise RuntimeError("handbook article was not stored")
    return row, None


async def update_article(
    db_session: AsyncSession,
    article_id: UUID,
    *,
    title: str | None = None,
    body: str | None = None,
    folder_id: UUID | None = None,
    set_folder_id: bool = False,
) -> tuple[dict | None, str | None]:
    article = await db_session.get(hb_orm.HandbookArticle, article_id)
    if article is None:
        return None, "not_found"
    if title is not None:
        article.title = title
    if body is not None:
        article.body = sanitize_html(body)
    if set_folder_id:
        err = await _ensure_folder(db_session, folder_id)
        if err:
            return None, err
        article.folder_id = folder_id
    await db_session.flush()
    return await get_article(db_session, article_id), None


async def delete_article(db_session: AsyncSession, article_id: UUID) -> bool:
    article = await db_session.get(hb_orm.HandbookArticle, article_id)
    if article is None:
        return False
    assets = (
        await db_session.scalars(
            select(hb_orm.HandbookAsset).where(
                hb_orm.HandbookAsset.article_id == article_id
            )
        )
    ).all()
    folder = _article_dir(article_id)
    for asset in assets:
        path = folder / asset.storage_name
        if path.exists():
            path.unlink()
    if folder.exists():
        for leftover in folder.iterdir():
            leftover.unlink()
        folder.rmdir()
    await db_session.delete(article)
    await db_session.flush()
    return True


async def add_asset(
    db_session: AsyncSession,
    *,
    article_id: UUID,
    filename: str,
    content_type: str,
    data: bytes,
) -> dict | None:
    article = await db_session.get(hb_orm.HandbookArticle, article_id)
    if article is None:
        return None
    asset_id = uuid.uuid4()
    safe = _safe_filename(filename)
    storage_name = f"{asset_id}_{safe}"
    path = _article_dir(article_id) / storage_name
    path.write_bytes(data)
    asset = hb_orm.HandbookAsset(
        id=asset_id,
        article_id=article_id,
        filename=safe,
        content_type=content_type or "application/octet-stream",
        storage_name=storage_name,
        size_bytes=len(data),
    )
    db_session.add(asset)
    await db_session.flush()
    return {
        "id": asset.id,
        "article_id": article_id,
        "filename": asset.filename,
        "content_type": asset.content_type,
        "size_bytes": asset.size_bytes,
        "url": f"/api/handbook/assets/{asset.id}",
    }


async def get_asset(
    db_session: AsyncSession, asset_id: UUID
) -> tuple[hb_orm.HandbookAsset, Path] | None:
    asset = await db_session.get(hb_orm.HandbookAsset, asset_id)
    if asset is None:
        return None
    path = _article_dir(asset.article_id) / asset.storage_name
    if not path.exists():
        return None
    return asset, path


async def article_count(db_session: AsyncSession) -> int:
    return int(
        await db_session.scalar(select(func.count()).select_from(hb_orm.HandbookArticle))
        or 0
    )
