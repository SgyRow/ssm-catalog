from papermerge.search.query_utils import prepare_user_query


def build_entity_type_clause(entity_type: str | None) -> str | None:
    if entity_type == "folder":
        return "(*:* AND -document_id:[* TO *])"
    if entity_type == "document":
        return "document_id:[* TO *]"
    return None


TITLE_SORT_FETCH_LIMIT = 2000


def sort_items_by_title(items, sort: str):
    reverse = sort == "title_desc"
    return sorted(items, key=lambda item: item.title.casefold(), reverse=reverse)


def paginate_items(items, *, page_number: int, page_size: int):
    total = len(items)
    num_pages = max(1, (total + page_size - 1) // page_size)
    page_number = min(max(page_number, 1), num_pages)
    start = (page_number - 1) * page_size
    return items[start : start + page_size], num_pages


def build_search_query(
    q: str,
    *,
    access_filter: str,
    entity_type: str | None = None,
) -> str:
    clauses = [f"({prepare_user_query(q)})"]

    entity_clause = build_entity_type_clause(entity_type)
    if entity_clause:
        clauses.append(entity_clause)

    clauses.append(access_filter)
    return " AND ".join(clauses)
