"""Apply Alembic migrations on API startup (native dev helper)."""

from __future__ import annotations

import logging
import os
from pathlib import Path

from alembic import command
from alembic.config import Config

from papermerge.core.config import get_settings

logger = logging.getLogger(__name__)


def run_pending_migrations() -> None:
    """Upgrade to head using the same DB URL as the running app."""
    settings = get_settings()
    db_url = resolve_database_url(settings)
    os.environ.setdefault("PAPERMERGE__DATABASE__URL", db_url)

    root = Path(__file__).resolve().parents[2]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", db_url)

    safe_target = db_url.split("@")[-1] if "@" in db_url else db_url
    logger.info("Applying alembic migrations (target: %s)", safe_target)
    command.upgrade(cfg, "head")


def resolve_database_url(settings=None) -> str:
    if settings is None:
        settings = get_settings()
    env_url = os.environ.get("PAPERMERGE__DATABASE__URL")
    if env_url:
        return env_url
    return settings.papermerge__database__url
