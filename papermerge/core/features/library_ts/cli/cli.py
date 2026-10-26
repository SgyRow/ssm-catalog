import typer
from rich.console import Console

from papermerge.core.config import get_settings
from papermerge.core.db.engine import AsyncSessionLocal
from papermerge.core.features.library_ts.db import api as lib_api
from papermerge.core.features.library_ts.db import settings_api as library_settings_api
from papermerge.core.utils.cli import async_command

app = typer.Typer(help="Library catalog (public browsing root)")


@app.command("init-catalog")
@async_command
async def init_catalog():
    """Ensure library_settings row and catalog root (admin home folder by default)."""
    console = Console()
    settings = get_settings()
    admin_username = settings.papermerge__dev__auth_bypass_username or "admin"
    async with AsyncSessionLocal() as db_session:
        root_id, err = await library_settings_api.ensure_library_catalog_bootstrap(
            db_session, admin_username=admin_username
        )
        await library_settings_api.ensure_library_settings_row(db_session)
        await db_session.commit()
    if err:
        console.print(err, style="red")
        raise typer.Exit(1)
    console.print(
        f"Library catalog ready: catalog_root_node_id={root_id}",
        style="green",
    )


@app.command("purge-trash")
@async_command
async def purge_trash():
    """Permanently delete trashed nodes past the configured retention window."""
    console = Console()
    async with AsyncSessionLocal() as db_session:
        removed = await lib_api.run_auto_trash_purge(db_session)
    console.print(
        f"Auto-purged {len(removed)} trashed node(s).",
        style="green" if removed else "blue",
    )
