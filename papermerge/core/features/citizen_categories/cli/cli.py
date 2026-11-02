from uuid import UUID

import typer
from rich.console import Console
from rich.table import Table

from papermerge.core.db.engine import AsyncSessionLocal
from papermerge.core.features.citizen_categories import schema as cat_schema
from papermerge.core.features.citizen_categories.db import api as cat_dbapi
from papermerge.core.utils.cli import async_command

app = typer.Typer(help="Citizen categories")
console = Console()


def _print_categories(items):
    table = Table(title="Citizen categories")
    table.add_column("ID")
    table.add_column("Name")
    table.add_column("Description")
    table.add_column("Sort")
    table.add_column("Folders")
    for item in items:
        table.add_row(
            str(item.id), item.name, item.description or "", str(item.sort_order),
            str(item.folder_count),
        )
    console.print(table)


@app.command("ls")
@async_command
async def categories_ls():
    """List citizen categories."""
    async with AsyncSessionLocal() as db_session:
        items = await cat_dbapi.list_categories(db_session)
    _print_categories(items)


@app.command("add")
@async_command
async def category_add(
    name: str = typer.Argument(..., help="Category name"),
    description: str = typer.Option(None, help="Category description"),
    sort_order: int = typer.Option(0, help="Sort order"),
):
    """Create a citizen category."""
    async with AsyncSessionLocal() as db_session:
        item, err = await cat_dbapi.create_category(
            db_session,
            cat_schema.CitizenCategoryCreateIn(
                name=name, description=description, sort_order=sort_order
            ),
        )
        await db_session.commit()
    if err:
        console.print(f"Failed to create category: {err}", style="red")
        raise typer.Exit(1)
    console.print(f"Category [bold]{item.name}[/bold] created (id={item.id})", style="green")


@app.command("update")
@async_command
async def category_update(
    category_id: UUID = typer.Argument(..., help="Category ID"),
    name: str = typer.Option(None, help="New name"),
    description: str = typer.Option(None, help="New description"),
    sort_order: int = typer.Option(None, help="New sort order"),
):
    """Update a citizen category."""
    async with AsyncSessionLocal() as db_session:
        item, err = await cat_dbapi.update_category(
            db_session,
            category_id,
            cat_schema.CitizenCategoryUpdateIn(
                name=name, description=description, sort_order=sort_order
            ),
        )
        await db_session.commit()
    if err:
        console.print(f"Update failed ({err}); nothing changed", style="red")
        raise typer.Exit(1)
    console.print(f"Category [bold]{item.name}[/bold] updated (id={item.id})", style="green")


@app.command("delete")
@async_command
async def category_delete(category_id: UUID = typer.Argument(..., help="Category ID")):
    """Delete a citizen category."""
    async with AsyncSessionLocal() as db_session:
        deleted = await cat_dbapi.delete_category(db_session, category_id)
        await db_session.commit()
    if not deleted:
        console.print(f"Category {category_id} not found", style="red")
        raise typer.Exit(1)
    console.print(f"Category {category_id} deleted", style="green")
