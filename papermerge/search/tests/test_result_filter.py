import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from papermerge.search.result_filter import (
    _item_node_id,
    deduplicate_document_pages,
    filter_deleted_search_results,
)


def test_item_node_id_document_uses_document_id():
    doc_id = str(uuid.uuid4())
    page_id = str(uuid.uuid4())
    item = SimpleNamespace(
        entity_type="document",
        document_id=doc_id,
        id=page_id,
    )
    assert _item_node_id(item) == doc_id


def test_item_node_id_folder_uses_id():
    folder_id = str(uuid.uuid4())
    item = SimpleNamespace(entity_type="folder", id=folder_id)
    assert _item_node_id(item) == folder_id


def test_deduplicate_document_pages_keeps_first_hit_per_document():
    doc_id = str(uuid.uuid4())
    items = [
        SimpleNamespace(
            entity_type="document",
            document_id=doc_id,
            id=str(uuid.uuid4()),
            page_number=1,
        ),
        SimpleNamespace(
            entity_type="document",
            document_id=doc_id,
            id=str(uuid.uuid4()),
            page_number=2,
        ),
        SimpleNamespace(
            entity_type="document",
            document_id=doc_id,
            id=str(uuid.uuid4()),
            page_number=3,
        ),
    ]

    out = deduplicate_document_pages(items)
    assert len(out) == 1
    assert out[0].page_number == 1


def test_deduplicate_document_pages_preserves_folder_hits():
    folder_id = str(uuid.uuid4())
    items = [
        SimpleNamespace(entity_type="folder", id=folder_id, title="A"),
        SimpleNamespace(entity_type="folder", id=folder_id, title="A"),
    ]

    out = deduplicate_document_pages(items)
    assert len(out) == 1


@pytest.mark.asyncio
async def test_filter_deleted_drops_soft_deleted_nodes():
    alive_doc = str(uuid.uuid4())
    deleted_doc = str(uuid.uuid4())
    results = SimpleNamespace(
        page_size=10,
        page_number=1,
        num_pages=1,
        items=[
            SimpleNamespace(
                entity_type="document",
                document_id=alive_doc,
                id=str(uuid.uuid4()),
            ),
            SimpleNamespace(
                entity_type="document",
                document_id=deleted_doc,
                id=str(uuid.uuid4()),
            ),
        ],
    )

    session = AsyncMock()
    session.scalars = AsyncMock(
        return_value=MagicMock(
            all=MagicMock(return_value=[uuid.UUID(alive_doc)])
        )
    )

    out = await filter_deleted_search_results(session, results)
    assert out is results
    assert len(results.items) == 1
    assert _item_node_id(results.items[0]) == alive_doc
