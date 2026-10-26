import typer
from rich.console import Console

from papermerge.core.db.engine import AsyncSessionLocal
from papermerge.core.features.portal.db import api as portal_dbapi
from papermerge.core.utils.cli import async_command

app = typer.Typer(help="Legal portal (shared catalog root)")


@app.command("init")
@async_command
async def portal_init():
    """Ensure portal group, root folder, and portal_settings row exist."""
    console = Console()
    async with AsyncSessionLocal() as db_session:
        root_id, group_id, err = await portal_dbapi.ensure_portal_bootstrap(db_session)
    if err:
        console.print(err, style="red")
        raise typer.Exit(1)
    console.print(
        f"Portal ready: root_node_id={root_id} group_id={group_id}",
        style="green",
    )
