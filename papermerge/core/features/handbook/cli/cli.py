from uuid import UUID

import typer
from rich.console import Console
from rich.table import Table

from papermerge.core.db.engine import AsyncSessionLocal
from papermerge.core.features.handbook.db import api as handbook_dbapi
from papermerge.core.utils.cli import (
    async_command,
    get_user_by_username,
    resolve_body,
)

app = typer.Typer(help="Handbook (reference articles)")
console = Console()


@app.command("ls")
@async_command
async def articles_ls():
    """List handbook articles."""
    async with AsyncSessionLocal() as db_session:
        items = await handbook_dbapi.list_articles(db_session)

    table = Table(title="Handbook articles")
    table.add_column("ID")
    table.add_column("Title")
    table.add_column("Author")
    table.add_column("Updated")
    for item in items:
        table.add_row(
            str(item["id"]), item["title"], item["author_username"], str(item["updated_at"])
        )
    console.print(table)


@app.command("add")
@async_command
async def article_add(
    title: str = typer.Argument(..., help="Article title"),
    author: str = typer.Option(None, help="Author username (nullable)"),
    body: str = typer.Option(None, help="Article HTML body"),
    body_file: str = typer.Option(None, help="Read body from this file"),
):
    """Create a handbook article."""
    article_body = resolve_body(body, body_file, console)
    author_id = None
    async with AsyncSessionLocal() as db_session:
        if author:
            author_user = await get_user_by_username(db_session, author)
            if author_user is None:
                console.print(f"User [bold]{author}[/bold] not found", style="red")
                raise typer.Exit(1)
            author_id = author_user.id
        try:
            item = await handbook_dbapi.create_article(
                db_session, title=title, body=article_body, author_id=author_id
            )
        except Exception as e:
            await db_session.rollback()
            console.print(f"Failed to create article: {e}", style="red")
            raise typer.Exit(1)
        await db_session.commit()

    console.print(
        f"Article [bold]{item['title']}[/bold] created (id={item['id']})", style="green"
    )


@app.command("delete")
@async_command
async def article_delete(article_id: UUID = typer.Argument(..., help="Article ID")):
    """Delete a handbook article and its asset files."""
    async with AsyncSessionLocal() as db_session:
        deleted = await handbook_dbapi.delete_article(db_session, article_id)
        await db_session.commit()
    if not deleted:
        console.print(f"Article {article_id} not found", style="red")
        raise typer.Exit(1)
    console.print(f"Article {article_id} deleted", style="green")
