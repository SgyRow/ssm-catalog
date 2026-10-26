import logging

import requests
from glom import glom
from salinic import IndexRO, create_engine

from papermerge.search.schema import (
    DocumentPage,
    Folder,
    PaginatedResponse,
    SearchIndex,
)
logger = logging.getLogger(__name__)


def search_index(
    search_url: str,
    combined_q: str,
    *,
    page_number: int,
    page_size: int,
    sort: str | None = None,
) -> PaginatedResponse:
    engine = create_engine(search_url)
    backend = IndexRO(engine, schema=SearchIndex).backend
    client = backend.client

    payload = {
        "q": combined_q,
        "rows": page_size,
        "start": page_size * (page_number - 1),
    }
    if sort:
        payload["sort"] = sort

    logger.debug("Solr search payload: %s", payload)
    response = requests.get(client.http_select_url, params=payload, timeout=30)
    response.raise_for_status()
    result = response.json()

    items = glom(result, "response.docs")
    total_found = glom(result, "response.numFound")
    start = glom(result, "response.start")
    page_number = int(start / page_size) + 1
    num_pages = max(1, int((total_found + page_size - 1) / page_size))
    returned_list = []

    for item in items:
        if document_id := item.get("document_id", None):
            lang = item.get("lang", "en")
            title = item.get(f"title_txt_{lang}", lang)
            tags = item.get("tags", [])
            returned_list.append(
                DocumentPage(
                    id=item["id"],
                    page_number=item["page_number"],
                    document_id=document_id,
                    title=title,
                    lang=lang,
                    tags=tags,
                )
            )
        else:
            lang = item.get("lang", "en")
            title = item.get(f"title_txt_{lang}", lang)
            returned_list.append(
                Folder(
                    id=item["id"],
                    title=title,
                    lang=lang,
                    tags=item.get("tags", []),
                )
            )

    return PaginatedResponse(
        page_size=page_size,
        page_number=page_number,
        num_pages=num_pages,
        items=returned_list,
    )
