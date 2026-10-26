import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import orm


def _item_node_id(item) -> str:
    """Map a Solr hit to the owning node id (salinic item types != our schema)."""
    if getattr(item, "entity_type", None) == "document":
        return str(item.document_id)
    if getattr(item, "document_id", None):
        return str(item.document_id)
    return str(item.id)


def deduplicate_document_pages(items: list) -> list:
    """Keep one Solr hit per document/folder (first = best relevance)."""
    seen: set[str] = set()
    unique: list = []

    for item in items:
        node_id = _item_node_id(item)
        if node_id in seen:
            continue
        seen.add(node_id)
        unique.append(item)

    return unique


async def filter_deleted_search_results(db_session: AsyncSession, results):
    """Drop Solr hits whose node was soft-deleted in Postgres."""
    if not results.items:
        return results

    node_ids: list[uuid.UUID] = []
    for item in results.items:
        try:
            node_ids.append(uuid.UUID(_item_node_id(item)))
        except ValueError:
            continue

    if not node_ids:
        return results

    alive_ids = {
        str(row)
        for row in (
            await db_session.scalars(
                select(orm.Node.id).where(
                    orm.Node.id.in_(node_ids),
                    orm.Node.deleted_at.is_(None),
                )
            )
        ).all()
    }

    filtered = [item for item in results.items if _item_node_id(item) in alive_ids]
    if len(filtered) == len(results.items):
        return results

    # Mutate in place: salinic result items are not our pydantic subclasses.
    results.items = filtered
    return results