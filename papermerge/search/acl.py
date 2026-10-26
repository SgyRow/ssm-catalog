import uuid


def build_solr_access_filter(
    *,
    user_id: uuid.UUID,
    group_ids: list[uuid.UUID],
    portal_group_id: uuid.UUID | None,
    include_portal: bool,
) -> str:
    """Build Solr boolean filter for nodes the user may search."""
    clauses = [f"user_id:{user_id}"]
    seen = {user_id}

    for group_id in group_ids:
        if group_id not in seen:
            clauses.append(f"group_id:{group_id}")
            seen.add(group_id)

    if include_portal and portal_group_id is not None and portal_group_id not in seen:
        clauses.append(f"group_id:{portal_group_id}")

    return "(" + " OR ".join(clauses) + ")"
