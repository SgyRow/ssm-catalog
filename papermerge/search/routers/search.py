from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core.features.users import schema as usr_schema
from papermerge.core.features.auth import get_current_user, scopes
from papermerge.core.config import get_settings
from papermerge.core.db.engine import get_db
from papermerge.core.features.library_ts.db import api as lib_ts_api
from papermerge.core.features.portal.db import api as portal_dbapi
from papermerge.core.features.users.db import api as usr_dbapi
from papermerge.search.acl import build_solr_access_filter
from papermerge.search.query_build import (
    TITLE_SORT_FETCH_LIMIT,
    build_search_query,
    paginate_items,
    sort_items_by_title,
)
from papermerge.search.result_filter import (
    deduplicate_document_pages,
    filter_deleted_search_results,
)
from papermerge.search.schema import PaginatedResponse, coerce_search_item
from papermerge.search.solr_search import search_index

router = APIRouter(prefix="/search", tags=["search"])
config = get_settings()


@router.get("/", response_model=PaginatedResponse)
async def search(
    q: str,
    page_number: int = 1,
    page_size: int = 10,
    entity_type: Literal["folder", "document"] | None = Query(default=None),
    sort: Literal["relevance", "title_asc", "title_desc"] | None = Query(
        default=None
    ),
    user: usr_schema.User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db),
):
    if not config.papermerge__search__url:
        raise HTTPException(status_code=503, detail="Search is not configured")

    user_details, _err = await usr_dbapi.get_user_details(db_session, user.id)
    group_ids = [group.id for group in user_details.groups] if user_details else []
    portal_group_id = await portal_dbapi.get_portal_group_id(db_session)
    include_portal = scopes.PORTAL_VIEW in (user.scopes or [])

    access_filter = build_solr_access_filter(
        user_id=user.id,
        group_ids=group_ids,
        portal_group_id=portal_group_id,
        include_portal=include_portal,
    )
    combined_q = build_search_query(
        q,
        access_filter=access_filter,
        entity_type=entity_type,
    )

    results = search_index(
        config.papermerge__search__url,
        combined_q,
        page_number=1,
        page_size=TITLE_SORT_FETCH_LIMIT,
    )
    results = await filter_deleted_search_results(db_session, results)
    items = deduplicate_document_pages(results.items)

    if sort in ("title_asc", "title_desc"):
        items = sort_items_by_title(items, sort)

    page_items, num_pages = paginate_items(
        items,
        page_number=page_number,
        page_size=page_size,
    )
    results = PaginatedResponse(
        page_size=page_size,
        page_number=page_number,
        num_pages=num_pages,
        items=[coerce_search_item(item) for item in page_items],
    )
    await lib_ts_api.log_search_query(db_session, user.id, q)
    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="search_query",
        resource_type="search",
        detail=q[:2000],
    )
    await db_session.commit()
    return results
