"""In-process periodic auto-purge of expired trash nodes.

Startup CLI (`paper-cli library purge-trash` in entrypoint) only runs when the
container starts. This scheduler keeps the retention policy enforced while the
API stays up.
"""

from __future__ import annotations

import asyncio
import logging

from papermerge.core.config import get_settings
from papermerge.core.db.engine import AsyncSessionLocal

logger = logging.getLogger(__name__)

_stop: asyncio.Event | None = None
_task: asyncio.Task | None = None


async def run_trash_purge_once() -> int:
    """Purge expired trash once; returns number of hard-deleted node IDs."""
    from papermerge.core.features.library_ts.db import api as lib_api

    async with AsyncSessionLocal() as db_session:
        removed = await lib_api.run_auto_trash_purge(db_session)
    return len(removed)


async def _loop(interval_seconds: int, stop: asyncio.Event) -> None:
    logger.info(
        "Trash auto-purge scheduler started (interval=%ss)",
        interval_seconds,
    )
    while not stop.is_set():
        try:
            count = await run_trash_purge_once()
            if count:
                logger.info("Auto-purged %s trashed node(s)", count)
            else:
                logger.debug("Trash auto-purge: nothing expired")
        except Exception:
            logger.exception("Trash auto-purge failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval_seconds)
        except asyncio.TimeoutError:
            pass
    logger.info("Trash auto-purge scheduler stopped")


def start_trash_purge_scheduler() -> None:
    """Start the background loop if interval > 0 and not already running."""
    global _stop, _task
    settings = get_settings()
    interval = settings.papermerge__main__trash_purge_interval_seconds
    if interval <= 0:
        logger.info("Trash auto-purge scheduler disabled (interval<=0)")
        return
    if _task is not None and not _task.done():
        return
    _stop = asyncio.Event()
    _task = asyncio.create_task(
        _loop(interval, _stop), name="trash-purge-scheduler"
    )


async def stop_trash_purge_scheduler() -> None:
    """Signal the loop to stop and wait briefly for a clean exit."""
    global _stop, _task
    if _stop is not None:
        _stop.set()
    task = _task
    _task = None
    _stop = None
    if task is None:
        return
    try:
        await asyncio.wait_for(task, timeout=30)
    except (asyncio.TimeoutError, asyncio.CancelledError):
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
