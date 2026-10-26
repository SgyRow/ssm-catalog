import typer
from rich.console import Console
from rich.table import Table
from sqlalchemy import select

from papermerge.core.db.engine import AsyncSessionLocal
from papermerge.core.features.groups.db import api as dbapi
from papermerge.core.features.groups.db import orm
from papermerge.core.utils.cli import async_command

app = typer.Typer(help="Groups management")
console = Console()


@app.command()
@async_command
async def create_admin(exists_ok: bool = True):
    """Creates a group named 'admin'. Idempotent when ``exists_ok`` is set."""
    async with AsyncSessionLocal() as db_session:
        group = await dbapi.create_group(
            db_session, name="admin", exists_ok=exists_ok
        )

    console.print(
        f"Group [bold]admin[/bold] ready (id={group.id})", style="green"
    )


@app.command(name="ls")
@async_command
async def list_groups():
    """List existing groups."""
    async with AsyncSessionLocal() as db_session:
        stmt = select(orm.Group).order_by(orm.Group.name)
        db_items = (await db_session.execute(stmt)).scalars().unique().all()

    if not db_items:
        console.print("No groups found")
        return

    table = Table(title="Groups")
    table.add_column("ID", no_wrap=True)
    table.add_column("Name")
    for item in db_items:
        table.add_row(str(item.id), item.name)

    console.print(table)
