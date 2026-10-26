import logging
import uuid

from salinic import IndexRW, create_engine

from papermerge.core import dbapi, schema
from papermerge.core.config import get_settings
from papermerge.core.db.engine import AsyncSessionLocal
from papermerge.search.page_text import resolve_page_search_text
from papermerge.search.schema import SearchIndex

logger = logging.getLogger(__name__)


def _owner_fields(node) -> dict[str, str]:
    fields: dict[str, str] = {}
    if node.user_id is not None:
        fields["user_id"] = str(node.user_id)
    if getattr(node, "group_id", None) is not None:
        fields["group_id"] = str(node.group_id)
    return fields


def get_index_rw() -> IndexRW:
    settings = get_settings()
    search_url = settings.papermerge__search__url
    if not search_url:
        raise RuntimeError("PAPERMERGE__SEARCH__URL is not configured")
    engine = create_engine(search_url)
    return IndexRW(engine, schema=SearchIndex)


async def build_index_items(
    db_session, node_ids: list[uuid.UUID]
) -> list[SearchIndex]:
    nodes = await dbapi.get_nodes(db_session, node_ids=node_ids)
    items: list[SearchIndex] = []

    for node in nodes:
        if isinstance(node, schema.Document):
            last_ver = await dbapi.get_last_doc_ver(db_session, doc_id=node.id)
            pages = await dbapi.get_doc_ver_pages(db_session, last_ver.id)
            for page in pages:
                page_text = await resolve_page_search_text(
                    db_session,
                    page_id=page.id,
                    doc_ver=last_ver,
                    current_text=page.text,
                )
                items.append(
                    SearchIndex(
                        id=str(page.id),
                        title=node.title,
                        document_id=str(node.id),
                        page_number=page.number,
                        text=page_text,
                        tags=[tag.name for tag in node.tags],
                        **_owner_fields(node),
                    )
                )
        else:
            items.append(
                SearchIndex(
                    id=str(node.id),
                    title=node.title,
                    tags=[tag.name for tag in node.tags],
                    **_owner_fields(node),
                )
            )

    return items


async def build_index_items_for_page(
    db_session, page_id: uuid.UUID
) -> SearchIndex | None:
    page = await dbapi.get_page(db_session, page_id)
    doc_ver = await dbapi.get_doc_ver(
        db_session, document_version_id=page.document_version_id
    )
    doc = await dbapi.get_doc(db_session, document_id=doc_ver.document_id)
    nodes = await dbapi.get_nodes(db_session, node_ids=[doc.id])
    if not nodes:
        return None
    node = nodes[0]
    page_text = await resolve_page_search_text(
        db_session,
        page_id=page.id,
        doc_ver=doc_ver,
        current_text=page.text,
    )
    return SearchIndex(
        id=str(page.id),
        title=node.title,
        document_id=str(node.id),
        page_number=page.number,
        text=page_text,
        tags=[tag.name for tag in node.tags],
        **_owner_fields(node),
    )


async def resolve_index_ids(
    db_session, node_ids: list[uuid.UUID]
) -> list[str]:
    """Map node UUIDs to search-index primary keys (folder id or page ids)."""
    index_ids: list[str] = []
    nodes = await dbapi.get_nodes(db_session, node_ids=node_ids)

    found_ids = {node.id for node in nodes}
    for node_id in node_ids:
        if node_id not in found_ids:
            index_ids.append(str(node_id))
            continue

    for node in nodes:
        if isinstance(node, schema.Document):
            last_ver = await dbapi.get_last_doc_ver(db_session, doc_id=node.id)
            pages = await dbapi.get_doc_ver_pages(db_session, last_ver.id)
            index_ids.extend(str(page.id) for page in pages)
        else:
            index_ids.append(str(node.id))

    return index_ids


async def index_node(node_id: uuid.UUID) -> None:
    async with AsyncSessionLocal() as db_session:
        items = await build_index_items(db_session, [node_id])
    index = get_index_rw()
    for item in items:
        logger.debug("Adding %s to search index", item.id)
        index.add(item)


async def index_nodes(node_ids: list[uuid.UUID]) -> None:
    async with AsyncSessionLocal() as db_session:
        items = await build_index_items(db_session, node_ids)
    index = get_index_rw()
    for item in items:
        logger.debug("Adding %s to search index", item.id)
        index.add(item)


async def index_pages(page_ids: list[uuid.UUID]) -> None:
    async with AsyncSessionLocal() as db_session:
        items: list[SearchIndex] = []
        for page_id in page_ids:
            item = await build_index_items_for_page(db_session, page_id)
            if item is not None:
                items.append(item)
    index = get_index_rw()
    for item in items:
        logger.debug("Adding page %s to search index", item.id)
        index.add(item)


async def remove_index_items(item_ids: list[uuid.UUID]) -> None:
    async with AsyncSessionLocal() as db_session:
        resolved = await resolve_index_ids(db_session, item_ids)
    index = get_index_rw()
    for item_id in resolved:
        logger.debug("Removing %s from search index", item_id)
        index.remove(id=item_id)


async def update_index(add_ver_id: uuid.UUID, remove_ver_id: uuid.UUID) -> None:
    add_page_ids: list[uuid.UUID] = []
    remove_page_ids: list[uuid.UUID] = []

    async with AsyncSessionLocal() as db_session:
        try:
            add_ver = await dbapi.get_doc_ver(
                db_session, document_version_id=add_ver_id
            )
            add_page_ids = [page.id for page in add_ver.pages]
        except Exception:
            logger.debug("Add doc version %s not found for index update", add_ver_id)

        try:
            remove_ver = await dbapi.get_doc_ver(
                db_session, document_version_id=remove_ver_id
            )
            remove_page_ids = [page.id for page in remove_ver.pages]
        except Exception:
            logger.debug(
                "Remove doc version %s not found for index update", remove_ver_id
            )

    if remove_page_ids:
        await remove_index_items(remove_page_ids)
    if add_page_ids:
        await index_pages(add_page_ids)
