from uuid import UUID

import typer
from rich.console import Console
from rich.table import Table
from sqlalchemy import select

from papermerge.core.db.engine import AsyncSessionLocal
from papermerge.core.features.nodes import schema as nodes_schema
from papermerge.core.features.nodes.db import api as nodes_dbapi
from papermerge.core.features.nodes.db import orm as nodes_orm
from papermerge.core.utils.cli import async_command, get_user_by_username

app = typer.Typer(help="Folders and nodes")
console = Console()


async def _resolve_parent_id(db_session, parent_id: UUID | None, username: str | None) -> UUID:
    """Parent folder = explicit --parent-id or home folder of --user."""
    if parent_id is not None:
        return parent_id
    if username:
        user = await get_user_by_username(db_session, username)
        if user is None:
            console.print(f"User [bold]{username}[/bold] not found", style="red")
            raise typer.Exit(1)
        return user.home_folder_id
    console.print("Specify --parent-id or --user <username>", style="red")
    raise typer.Exit(1)


@app.command("create")
@async_command
async def folder_create(
    title: str = typer.Argument(..., help="Folder title"),
    parent_id: UUID = typer.Option(None, help="Parent folder node ID"),
    username: str = typer.Option(None, "--user", help="Create under this user's home folder"),
):
    """Create a folder."""
    async with AsyncSessionLocal() as db_session:
        parent = await _resolve_parent_id(db_session, parent_id, username)
        folder, err = await nodes_dbapi.create_folder(
            db_session,
            nodes_schema.NewFolder(title=title, ctype="folder", parent_id=parent),
        )
    if err:
        console.print(" ".join(err.messages), style="red")
        raise typer.Exit(1)
    console.print(f"Folder [bold]{folder.title}[/bold] created (id={folder.id})", style="green")


@app.command("ls")
@async_command
async def folder_ls(
    parent_id: UUID = typer.Option(None, help="Folder node ID to list"),
    username: str = typer.Option(None, "--user", help="List this user's home folder"),
):
    """List child nodes of a folder."""
    async with AsyncSessionLocal() as db_session:
        parent = await _resolve_parent_id(db_session, parent_id, username)
        stmt = (
            select(nodes_orm.Node)
            .where(nodes_orm.Node.parent_id == parent)
            .order_by(nodes_orm.Node.sort_index, nodes_orm.Node.title)
        )
        nodes = (await db_session.execute(stmt)).scalars().all()

    table = Table(title="Folder contents")
    table.add_column("ID")
    table.add_column("Type")
    table.add_column("Title")
    for node in nodes:
        table.add_row(str(node.id), node.ctype, node.title)
    console.print(table)
