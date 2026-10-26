from papermerge.search.query_build import (
    TITLE_SORT_FETCH_LIMIT,
    build_entity_type_clause,
    build_search_query,
    paginate_items,
    sort_items_by_title,
)


def test_build_entity_type_clause():
    assert build_entity_type_clause(None) is None
    assert "document_id" in build_entity_type_clause("folder")
    assert "document_id" in build_entity_type_clause("document")


def test_paginate_items():
    items = list(range(25))
    page, num_pages = paginate_items(items, page_number=2, page_size=10)
    assert page == list(range(10, 20))
    assert num_pages == 3


def test_sort_items_by_title():
    class Item:
        def __init__(self, title: str):
            self.title = title

    items = [Item("Beta"), Item("alpha"), Item("Gamma")]
    sorted_items = sort_items_by_title(items, "title_asc")
    assert [i.title for i in sorted_items] == ["alpha", "Beta", "Gamma"]


def test_build_search_query_includes_filters():
    q = build_search_query(
        "invoice",
        access_filter="user_id:abc",
        entity_type="document",
    )
    assert "user_id:abc" in q
    assert "document_id:[* TO *]" in q


def test_title_sort_fetch_limit_is_reasonable():
    assert TITLE_SORT_FETCH_LIMIT >= 100
