from uuid import UUID

import typer
from rich.console import Console
from rich.table import Table
from sqlalchemy import select

from papermerge.core.db.engine import AsyncSessionLocal
from papermerge.core.features.tags import schema as tag_schema
from papermerge.core.features.tags.db import api as tags_dbapi
from papermerge.core.features.tags.db import orm as tags_orm
from papermerge.core.utils.cli import async_command, get_user_by_username

app = typer.Typer(help="Tags")
console = Console()


@app.command("ls")
@async_command
async def tags_ls():
    """List all tags."""
    async with AsyncSessionLocal() as db_session:
        stmt = select(tags_orm.Tag).order_by(tags_orm.Tag.name)
        tags = (await db_session.execute(stmt)).scalars().all()

    table = Table(title="Tags")
    table.add_column("ID")
    table.add_column("Name")
    table.add_column("Description")
    table.add_column("User ID")
    table.add_column("Group ID")
    for tag in tags:
        table.add_row(
            str(tag.id), tag.name, tag.description or "",
            str(tag.user_id) if tag.user_id else "",
            str(tag.group_id) if tag.group_id else "",
        )
    console.print(table)


@app.command("add")
@async_command
async def tag_add(
    name: str = typer.Argument(..., help="Tag name"),
    user: str = typer.Option(None, "--user", help="Owner username (or --group)"),
    group: UUID = typer.Option(None, "--group", help="Owner group ID"),
    description: str = typer.Option(None, help="Tag description"),
    bg_color: str = typer.Option(None, help="Background color"),
    fg_color: str = typer.Option(None, help="Foreground color"),
):
    """Create a tag owned by a user or a group."""
    user_id = None
    group_id = group
    async with AsyncSessionLocal() as db_session:
        if user:
            user_obj = await get_user_by_username(db_session, user)
            if user_obj is None:
                console.print(f"User [bold]{user}[/bold] not found", style="red")
                raise typer.Exit(1)
            user_id = user_obj.id
        if user_id is None and group_id is None:
            console.print("Specify --user or --group (tag owner)", style="red")
            raise typer.Exit(1)
        attrs = tag_schema.CreateTag(
            name=name,
            description=description,
            bg_color=bg_color or tag_schema.DEFAULT_TAG_BG_COLOR,
            fg_color=fg_color or tag_schema.DEFAULT_TAG_FG_COLOR,
            user_id=user_id,
            group_id=group_id,
        )
        tag, err = await tags_dbapi.create_tag(db_session, attrs)
    if err:
        console.print(" ".join(err.messages), style="red")
        raise typer.Exit(1)
    console.print(f"Tag [bold]{tag.name}[/bold] created (id={tag.id})", style="green")
