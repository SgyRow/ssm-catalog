import asyncio
import logging
import uuid

from celery import shared_task

from papermerge.core import constants
from papermerge.core.db.engine import get_engine
from papermerge.search import indexing

logger = logging.getLogger(__name__)


def _run(coro):
    """Run async indexing code inside Celery prefork workers.

    SQLAlchemy's async engine binds to the event loop of the first
    ``asyncio.run`` call in a worker process; later tasks must dispose it
    so the next task gets a fresh loop-bound pool.
    """
    try:
        return asyncio.run(coro)
    finally:
        try:
            asyncio.run(get_engine().dispose())
        except Exception:
            logger.exception("Failed to dispose SQLAlchemy engine after index task")


@shared_task(name=constants.INDEX_ADD_NODE)
def index_add_node(node_id: str):
    logger.debug("index_add_node(%s)", node_id)
    _run(indexing.index_node(uuid.UUID(node_id)))


@shared_task(name=constants.INDEX_ADD_DOCS)
def index_add_docs(doc_ids: list[str]):
    logger.debug("index_add_docs(%s)", doc_ids)
    _run(indexing.index_nodes([uuid.UUID(doc_id) for doc_id in doc_ids]))


@shared_task(name=constants.INDEX_ADD_PAGES)
def index_add_pages(page_ids: list[str]):
    logger.debug("index_add_pages(%s)", page_ids)
    _run(indexing.index_pages([uuid.UUID(page_id) for page_id in page_ids]))


@shared_task(name=constants.INDEX_REMOVE_NODE)
def index_remove_node(item_ids: list[str]):
    logger.debug("index_remove_node(%s)", item_ids)
    _run(indexing.remove_index_items([uuid.UUID(item_id) for item_id in item_ids]))


@shared_task(name=constants.INDEX_UPDATE)
def index_update(add_ver_id: str, remove_ver_id: str):
    logger.debug("index_update(add=%s, remove=%s)", add_ver_id, remove_ver_id)
    _run(
        indexing.update_index(
            uuid.UUID(add_ver_id),
            uuid.UUID(remove_ver_id),
        )
    )
