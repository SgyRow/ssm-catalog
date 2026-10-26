import logging
import uuid
from typing import Annotated, Iterable, Union
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Security, status
from sqlalchemy.exc import NoResultFound, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core.exceptions import HTTP404NotFound, EntityNotFound
from papermerge.core.constants import INDEX_REMOVE_NODE
from papermerge.core.tasks import send_task
from papermerge.core import schema, config
from papermerge.core.features.auth import scopes, get_current_user, require_node_tags_user
from papermerge.core.constants import INDEX_ADD_NODE
from papermerge.core.features.document.db import api as doc_dbapi
from papermerge.core.features.nodes.db import api as nodes_dbapi
from papermerge.core.features.portal import policy as portal_policy
from papermerge.core.features.portal.db import api as portal_dbapi
from papermerge.core.features.library_ts.db import api as lib_ts_api
from papermerge.core.routers.common import OPEN_API_GENERIC_JSON_DETAIL
from papermerge.core.routers.params import CommonQueryParams
from papermerge.core.types import PaginatedResponse
from papermerge.core.db import common as dbapi_common
from papermerge.core import exceptions as exc
from papermerge.core.db.engine import get_db

router = APIRouter(prefix="/nodes", tags=["nodes"])

logger = logging.getLogger(__name__)
settings = config.get_settings()


@router.get(
    "/{parent_id}",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": (
                f"Missing `{scopes.COMMANDER_VIEW}` or no `{scopes.NODE_VIEW}` "
                "permission on the node"
            ),
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def get_node(
    parent_id: UUID,
    user: Annotated[
        schema.User,
        Security(get_current_user, scopes=[scopes.COMMANDER_VIEW, scopes.NODE_VIEW]),
    ],
    params: CommonQueryParams = Depends(),
    db_session: AsyncSession = Depends(get_db),
) -> PaginatedResponse[Union[schema.DocumentNode, schema.Folder]]:
    """Returns list of *paginated* direct descendants of `parent_id` node

    Requires ``commander.view`` (file manager access) and ``node.view`` on the parent.
    """
    order_by = ["sort_index"]

    if params.order_by:
        order_by = [item.strip() for item in params.order_by.split(",")]

    await portal_policy.require_portal_view_if_under_portal(
        db_session, user, parent_id
    )
    await dbapi_common.require_node_perm(
        db_session,
        node_id=parent_id,
        codename=scopes.NODE_VIEW,
        user_id=user.id,
    )

    nodes = await nodes_dbapi.get_paginated_nodes(
        db_session=db_session,
        parent_id=parent_id,
        user_id=user.id,
        page_size=params.page_size,
        page_number=params.page_number,
        order_by=order_by,
        filter=params.filter,
    )

    return nodes


@router.post(
    "/",
    status_code=201,
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"No `{scopes.NODE_CREATE}` permission on the parent node",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def create_node(
    pynode: schema.NewFolder | schema.NewDocument,
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.NODE_CREATE])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> schema.Folder | schema.Document | None:
    """Creates a node


    Node's `ctype` may be either `folder` or `document`.
    Optionally you may pass ID attribute. If ID is present and has
    non-emtpy UUID value, then newly create node will be assigned this
    custom ID.
    If node has `parent_id` empty then node will not be accessible to user.
    The only nodes with `parent_id` set to empty value are "user custom folders"
    like Home and Inbox.
    """
    if pynode.ctype == "folder":
        attrs = dict(
            title=pynode.title,
            ctype="folder",
            parent_id=pynode.parent_id,
        )
        if pynode.id:
            attrs["id"] = pynode.id
        new_folder = schema.NewFolder(**attrs)
        await dbapi_common.require_node_perm(
            db_session,
            node_id=pynode.parent_id,
            codename=scopes.NODE_CREATE,
            user_id=user.id,
        )
        await portal_policy.require_portal_on_create(
            db_session,
            user,
            pynode.parent_id,
            is_folder=True,
        )
        created_node, error = await nodes_dbapi.create_folder(db_session, new_folder)
    else:
        # if user does not specify document's language, get that
        # value from user preferences
        if pynode.lang is None:
            pynode.lang = settings.papermerge__ocr__default_lang_code

        attrs = dict(
            title=pynode.title,
            lang=pynode.lang,
            parent_id=pynode.parent_id,
            size=0,
            page_count=0,
            ocr=pynode.ocr,
            file_name=pynode.title,
            ctype="document",
        )
        if pynode.id:
            attrs["id"] = pynode.id

        new_document = schema.NewDocument(**attrs)

        await dbapi_common.require_node_perm(
            db_session,
            node_id=pynode.parent_id,
            codename=scopes.NODE_CREATE,
            user_id=user.id,
        )
        await portal_policy.require_portal_on_create(
            db_session,
            user,
            pynode.parent_id,
            is_folder=False,
        )

        created_node, error = await doc_dbapi.create_document(db_session, new_document)

    if error:
        raise HTTPException(status_code=400, detail=error.model_dump())

    root_id = await portal_dbapi.get_portal_root_id(db_session)
    is_portal = bool(
        root_id
        and await portal_dbapi.is_node_under_portal_root(
            db_session, created_node.id, root_id
        )
    )
    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="node_create",
        resource_type=created_node.ctype,
        resource_id=created_node.id,
        detail=lib_ts_api.audit_detail_json({"title": created_node.title, "portal": is_portal}),
    )
    await db_session.commit()

    send_task(INDEX_ADD_NODE, kwargs={"node_id": str(created_node.id)}, route_name="i3")
    return created_node


@router.patch(
    "/{node_id}",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"No `{scopes.NODE_UPDATE}` permission on the node",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def update_node(
    node_id: UUID,
    node: schema.UpdateNode,
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.NODE_UPDATE])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> schema.Node:
    """Updates node


    parent_id is optional field. However, when present, parent_id
    should be not empty string (UUID).
    """

    await dbapi_common.require_node_perm(
        db_session,
        node_id=node_id,
        codename=scopes.NODE_UPDATE,
        user_id=user.id,
    )
    await portal_policy.require_portal_on_update_node(db_session, user, node_id)

    updated_node = await nodes_dbapi.update_node(
        db_session, node_id=node_id, user_id=user.id, attrs=node
    )

    root_id = await portal_dbapi.get_portal_root_id(db_session)
    is_portal = bool(
        root_id
        and await portal_dbapi.is_node_under_portal_root(db_session, node_id, root_id)
    )
    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="node_update",
        resource_type="node",
        resource_id=node_id,
        detail=lib_ts_api.audit_detail_json(
            {
                "title": updated_node.title,
                "parent_id": str(updated_node.parent_id)
                if updated_node.parent_id
                else None,
                "portal": is_portal,
            }
        ),
    )
    await db_session.commit()

    send_task(INDEX_ADD_NODE, kwargs={"node_id": str(updated_node.id)}, route_name="i3")

    return updated_node


@router.post(
    "/{parent_id}/reorder",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": (
                f"No `{scopes.NODE_UPDATE}` permission on the parent folder"
            ),
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def reorder_nodes(
    parent_id: UUID,
    payload: schema.ReorderNodes,
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.NODE_UPDATE])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> schema.ReorderNodes:
    """Save a custom order of files and folders inside ``parent_id``."""
    await portal_policy.require_portal_view_if_under_portal(
        db_session, user, parent_id
    )
    await dbapi_common.require_node_perm(
        db_session,
        node_id=parent_id,
        codename=scopes.NODE_UPDATE,
        user_id=user.id,
    )
    await portal_policy.require_portal_on_reorder(db_session, user, parent_id)

    try:
        await nodes_dbapi.reorder_nodes(
            db_session,
            parent_id=parent_id,
            node_ids=payload.node_ids,
            user_id=user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await db_session.commit()
    return payload


@router.delete(
    "/",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"No `{scopes.NODE_DELETE}` permission on some of the nodes"
            "at least one of the specified nodes",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def delete_nodes(
    list_of_uuids: list[UUID],
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.NODE_DELETE])
    ],
    db_session: AsyncSession = Depends(get_db),
):
    """Deletes nodes with specified UUIDs


    Returns a list of UUIDs of actually deleted nodes.
    In case nothing was deleted (e.g. no nodes with specified UUIDs
    were found) - will return an empty list.
    """
    for node_id in list_of_uuids:
        await portal_policy.require_portal_on_delete_node(db_session, user, node_id)
        await dbapi_common.require_node_perm(
            db_session,
            node_id=node_id,
            codename=scopes.NODE_DELETE,
            user_id=user.id,
        )

    error = await nodes_dbapi.delete_nodes(
        db_session, node_ids=list_of_uuids, user_id=user.id
    )

    if error:
        raise HTTPException(status_code=400, detail=error.model_dump())

    send_task(
        INDEX_REMOVE_NODE,
        kwargs={"item_ids": [str(i) for i in list_of_uuids]},
        route_name="i3",
    )


@router.post(
    "/move",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"Check user has `{scopes.NODE_MOVE}` on all source nodes "
            f" and `{scopes.NODE_UPDATE}` on the target node.",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        },
        432: {
            "description": """Move of mentioned node is not possible due
            to duplicate title on the target""",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        },
        400: {
            "description": """No target node with specified UUID found""",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        },
        419: {
            "description": """No nodes were updated""",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        },
        420: {
            "description": """Not all nodes were updated""",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        },
    },
)
async def move_nodes(
    params: schema.MoveNode,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_MOVE])],
    db_session: AsyncSession = Depends(get_db),
) -> list[UUID]:
    """Move source nodes into the target node.

    User should have

        * `node.update` permission for the target node
        * `node.move` permission for each source node


    In other words, after successful completion of this action
    all source nodes will have target node as their parent.
    Think of set of folders and/or documents being moved from one
    folder into another folder.

    Returns UUIDs of successfully moved nodes.
    """
    try:
        for source_id in params.source_ids:
            await portal_policy.require_portal_on_move_source(
                db_session, user, source_id
            )
            await dbapi_common.require_node_perm(
                db_session,
                node_id=source_id,
                codename=scopes.NODE_MOVE,
                user_id=user.id,
            )

        await portal_policy.require_portal_on_move_target(
            db_session, user, params.target_id
        )
        await dbapi_common.require_node_perm(
            db_session,
            node_id=params.target_id,
            codename=scopes.NODE_UPDATE,
            user_id=user.id,
        )

        affected_row_count = await nodes_dbapi.move_nodes(
            db_session,
            source_ids=params.source_ids,
            target_id=params.target_id,
        )
    except NoResultFound as e:
        logger.error(e, exc_info=True)
        error = schema.Error(
            messages=["No results found. Please check that all source nodes exists"]
        )
        raise HTTPException(status_code=404, detail=error.model_dump())
    except ValueError as e:
        logger.debug(e, exc_info=True)
        error = schema.Error(messages=[str(e)])
        raise HTTPException(status_code=400, detail=error.model_dump())
    except (IntegrityError, EntityNotFound) as e:
        logger.debug(e, exc_info=True)
        error = schema.Error(
            messages=["Integrity error. Please check that target exists"]
        )
        raise HTTPException(status_code=400, detail=error.model_dump())

    if affected_row_count == 0:
        error = schema.Error(
            messages=["No nodes were updated. Please check that source nodes exists"]
        )
        raise HTTPException(status_code=419, detail=error.model_dump())

    if affected_row_count != len(params.source_ids):
        error = schema.Error(
            messages=[
                "Not all nodes were updated"
                f"(only {affected_row_count} out of {len(params.source_ids)})."
                " Please check that all source nodes exists"
            ]
        )
        raise HTTPException(status_code=420, detail=error.model_dump())

    root_id = await portal_dbapi.get_portal_root_id(db_session)
    for sid in params.source_ids:
        is_portal = bool(
            root_id
            and await portal_dbapi.is_node_under_portal_root(db_session, sid, root_id)
        )
        await lib_ts_api.add_audit(
            db_session,
            user_id=user.id,
            action="node_move",
            resource_type="node",
            resource_id=sid,
            detail=lib_ts_api.audit_detail_json(
                {"target_id": str(params.target_id), "portal": is_portal}
            ),
        )
    await db_session.commit()

    return params.source_ids


@router.post(
    "/{node_id}/tags",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"User does not have `{scopes.NODE_UPDATE}` or "
            f"`{scopes.DOCUMENT_UPDATE_TAGS}` permission on the node",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        },
    },
)
async def assign_node_tags(
    node_id: UUID,
    tags: list[str],
    user: Annotated[schema.User, Depends(require_node_tags_user)],
    db_session: AsyncSession = Depends(get_db),
) -> schema.Document | schema.Folder:
    """
    Assigns given list of tag names to the node.


    All tags not present in given list of tags names
    will be disassociated from the node; in other words upon
    successful completion of the request node will have ONLY
    tags from the list.
    Yet another way of thinking about http POST is as it **replaces
    existing node tags** with the one from input list.
    """
    try:
        await dbapi_common.require_node_perm_any(
            db_session,
            node_id,
            user.id,
            scopes.NODE_UPDATE,
            scopes.DOCUMENT_UPDATE_TAGS,
            scopes.TAG_SELECT,
        )

        node, error = await nodes_dbapi.assign_node_tags(
            db_session, node_id=node_id, tags=tags, user_id=user.id
        )
    except EntityNotFound:
        raise HTTP404NotFound

    if error:
        raise HTTPException(status_code=400, detail=error.model_dump())

    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="node_tags_set",
        resource_type="node",
        resource_id=node_id,
        detail=lib_ts_api.audit_detail_json({"tags": tags}),
    )
    await db_session.commit()

    send_task(INDEX_ADD_NODE, kwargs={"node_id": str(node_id)}, route_name="i3")

    return node


@router.get(
    "/",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"User does not have `{scopes.NODE_VIEW}` permission on "
            "some of the nodes",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        }
    },
)
async def get_nodes_details(
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    node_ids: list[uuid.UUID] | None = Query(default=None),
    db_session: AsyncSession = Depends(get_db),
) -> list[schema.Folder | schema.Document]:
    """Returns detailed information about queried nodes
    (breadcrumb, tags)

    Dev note: this API endpoint is used by UI to fetch tags and breadcrumbs
    for the *search results*, as search index does not store these attributes.

    """
    if node_ids is None:
        return []

    if len(node_ids) == 0:
        return []

    allowed_ids: list[uuid.UUID] = []
    for node_id in node_ids:
        if await dbapi_common.has_node_perm(
            db_session,
            node_id=node_id,
            codename=scopes.NODE_VIEW,
            user_id=user.id,
        ):
            allowed_ids.append(node_id)

    if not allowed_ids:
        return []

    nodes = await nodes_dbapi.get_nodes(db_session, node_ids=allowed_ids)

    return nodes


@router.patch(
    "/{node_id}/tags",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"User does not have `{scopes.NODE_UPDATE}` or "
            f"`{scopes.DOCUMENT_UPDATE_TAGS}` permission on the node",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        },
    },
)
async def update_node_tags(
    node_id: UUID,
    tags: list[str],
    user: Annotated[schema.User, Depends(require_node_tags_user)],
    db_session: AsyncSession = Depends(get_db),
) -> schema.Document | schema.Folder:
    """
    Appends given list of tag names to the node.


    Retains all previously associated node tags.
    Yet another way of thinking about http PATCH method is as it
    **appends** input tags to the currently associated tags.

    Example:

        Node N1 has 'invoice', 'important' tags.

        After following request:

            POST /api/nodes/<N1>/tags/

            tags: ['paid']

        Node N1 will have 'invoice', 'important', 'paid' tags.
        Notice that previously associated 'invoice' and 'important' tags
        are still assigned to N1.
    """
    try:
        await dbapi_common.require_node_perm_any(
            db_session,
            node_id,
            user.id,
            scopes.NODE_UPDATE,
            scopes.DOCUMENT_UPDATE_TAGS,
            scopes.TAG_SELECT,
        )

        node, error = await nodes_dbapi.update_node_tags(
            db_session, node_id=node_id, tags=tags, user_id=user.id
        )
    except EntityNotFound:
        raise HTTP404NotFound

    if error:
        raise HTTPException(status_code=400, detail=error.model_dump())

    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="node_tags_append",
        resource_type="node",
        resource_id=node_id,
        detail=lib_ts_api.audit_detail_json({"tags": tags}),
    )
    await db_session.commit()

    send_task(INDEX_ADD_NODE, kwargs={"node_id": str(node_id)}, route_name="i3")

    return node


@router.get(
    "/{node_id}/tags",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"User does not have `{scopes.NODE_VIEW}` permission on the node",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        },
    },
)
async def get_node_tags(
    node_id: UUID,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    db_session=Depends(get_db),
) -> Iterable[schema.Tag]:
    """
    Retrieves nodes tags

    """
    try:
        await dbapi_common.require_node_perm(
            db_session,
            node_id=node_id,
            codename=scopes.NODE_VIEW,
            user_id=user.id,
        )

        tags, error = await nodes_dbapi.get_node_tags(
            db_session, node_id=node_id, user_id=user.id
        )
    except EntityNotFound:
        raise HTTP404NotFound

    if error:
        raise HTTPException(status_code=400, detail=error.model_dump())

    return tags


@router.delete(
    "/{node_id}/tags",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"User does not have `{scopes.NODE_UPDATE}` or "
            f"`{scopes.DOCUMENT_UPDATE_TAGS}` permission on the node",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        },
    },
)
async def remove_node_tags(
    node_id: UUID,
    tags: list[str],
    user: Annotated[schema.User, Depends(require_node_tags_user)],
    db_session: AsyncSession = Depends(get_db),
) -> schema.Document | schema.Folder:
    """
    Dissociate given tags the node.


    Tags models are not deleted - just dissociated from the node.
    """
    try:
        await dbapi_common.require_node_perm_any(
            db_session,
            node_id,
            user.id,
            scopes.NODE_UPDATE,
            scopes.DOCUMENT_UPDATE_TAGS,
            scopes.TAG_SELECT,
        )

        node, error = await nodes_dbapi.remove_node_tags(
            db_session, node_id=node_id, tags=tags, user_id=user.id
        )
    except EntityNotFound:
        raise HTTP404NotFound

    if error:
        raise HTTPException(status_code=400, detail=error.model_dump())

    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="node_tags_remove",
        resource_type="node",
        resource_id=node_id,
        detail=lib_ts_api.audit_detail_json({"tags": tags}),
    )
    await db_session.commit()

    send_task(INDEX_ADD_NODE, kwargs={"node_id": str(node_id)}, route_name="i3")

    return node


@router.get(
    "/{node_id}/visibility",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"No `{scopes.NODE_VIEW}` permission on the node",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        },
    },
)
async def get_node_visibility(
    node_id: UUID,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.NODE_VIEW])],
    db_session: AsyncSession = Depends(get_db),
) -> schema.NodeVisibilitySettings:
    """Get visibility settings for a node (explicit + effective)."""
    from papermerge.core.features.nodes.db import visibility_api as vis_dbapi

    await dbapi_common.require_node_perm(
        db_session,
        node_id=node_id,
        codename=scopes.NODE_VIEW,
        user_id=user.id,
    )
    return await vis_dbapi.get_node_visibility_settings(db_session, node_id)


@router.put(
    "/{node_id}/visibility",
    responses={
        status.HTTP_403_FORBIDDEN: {
            "description": f"No `{scopes.NODE_UPDATE}` permission on the node",
            "content": OPEN_API_GENERIC_JSON_DETAIL,
        },
    },
)
async def update_node_visibility(
    node_id: UUID,
    attrs: schema.UpdateNodeVisibility,
    user: Annotated[
        schema.User, Security(get_current_user, scopes=[scopes.NODE_UPDATE])
    ],
    db_session: AsyncSession = Depends(get_db),
) -> schema.NodeVisibilitySettings:
    """Set visibility for a node (or inherit from parent)."""
    from papermerge.core.features.nodes.db import visibility_api as vis_dbapi

    await dbapi_common.require_node_perm(
        db_session,
        node_id=node_id,
        codename=scopes.NODE_UPDATE,
        user_id=user.id,
    )
    try:
        result = await vis_dbapi.set_node_visibility_settings(
            db_session, node_id, attrs
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await lib_ts_api.add_audit(
        db_session,
        user_id=user.id,
        action="node_visibility_update",
        resource_type="node",
        resource_id=node_id,
        detail=lib_ts_api.audit_detail_json(attrs.model_dump(mode="json")),
    )
    await db_session.commit()
    return result
