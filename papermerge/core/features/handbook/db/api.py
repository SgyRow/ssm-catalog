import re
import uuid
from pathlib import Path
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import orm
from papermerge.core.config import get_settings
from papermerge.core.features.handbook.db import orm as hb_orm
from papermerge.core.features.handbook.sanitize import sanitize_html

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def _article_dir(article_id: UUID) -> Path:
    root = get_settings().papermerge__main__media_root
    path = Path(root) / "handbook" / str(article_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe_filename(name: str) -> str:
    base = Path(name or "file").name
    cleaned = _SAFE_NAME.sub("_", base).strip("._")
    return cleaned[:180] or "file"


async def list_articles(db_session: AsyncSession) -> list[dict]:
    author = orm.User
    stmt = (
        select(
            hb_orm.HandbookArticle,
            author.username,
        )
        .outerjoin(author, author.id == hb_orm.HandbookArticle.author_id)
        .order_by(hb_orm.HandbookArticle.updated_at.desc())
    )
    rows = (await db_session.execute(stmt)).all()
    items = []
    for article, username in rows:
        items.append(
            {
                "id": article.id,
                "title": article.title,
                "body": article.body,
                "author_id": article.author_id,
                "author_username": username or "",
                "created_at": article.created_at,
                "updated_at": article.updated_at,
            }
        )
    return items


async def get_article(db_session: AsyncSession, article_id: UUID) -> dict | None:
    author = orm.User
    stmt = (
        select(hb_orm.HandbookArticle, author.username)
        .outerjoin(author, author.id == hb_orm.HandbookArticle.author_id)
        .where(hb_orm.HandbookArticle.id == article_id)
    )
    row = (await db_session.execute(stmt)).one_or_none()
    if row is None:
        return None
    article, username = row
    return {
        "id": article.id,
        "title": article.title,
        "body": article.body,
        "author_id": article.author_id,
        "author_username": username or "",
        "created_at": article.created_at,
        "updated_at": article.updated_at,
    }


async def create_article(
    db_session: AsyncSession, *, title: str, body: str, author_id: UUID | None
) -> dict:
    article = hb_orm.HandbookArticle(
        title=title,
        body=sanitize_html(body),
        author_id=author_id,
    )
    db_session.add(article)
    await db_session.flush()
    row = await get_article(db_session, article.id)
    if row is None:
        raise RuntimeError("handbook article was not stored")
    return row


async def update_article(
    db_session: AsyncSession,
    article_id: UUID,
    *,
    title: str | None,
    body: str | None,
) -> dict | None:
    article = await db_session.get(hb_orm.HandbookArticle, article_id)
    if article is None:
        return None
    if title is not None:
        article.title = title
    if body is not None:
        article.body = sanitize_html(body)
    await db_session.flush()
    return await get_article(db_session, article_id)


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
