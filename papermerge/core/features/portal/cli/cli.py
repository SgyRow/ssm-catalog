from uuid import UUID

import typer
from rich.console import Console
from rich.table import Table

from papermerge.core.db.engine import AsyncSessionLocal
from papermerge.core.features.portal.db import api as portal_dbapi
from papermerge.core.utils.cli import (
    async_command,
    get_user_by_username,
    resolve_body,
)

app = typer.Typer(help="Legal portal (shared catalog root)")
news_app = typer.Typer(help="Portal news posts")
app.add_typer(news_app, name="news")
console = Console()


@app.command("init")
@async_command
async def portal_init():
    """Ensure portal group, root folder, and portal_settings row exist."""
    async with AsyncSessionLocal() as db_session:
        root_id, group_id, err = await portal_dbapi.ensure_portal_bootstrap(db_session)
    if err:
        console.print(err, style="red")
        raise typer.Exit(1)
    console.print(
        f"Portal ready: root_node_id={root_id} group_id={group_id}", style="green"
    )


@news_app.command("ls")
@async_command
async def news_ls(page: int = 1, page_size: int = 20):
    """List portal news posts, newest first."""
    async with AsyncSessionLocal() as db_session:
        items, total = await portal_dbapi.list_portal_news(
            db_session, page=page, page_size=page_size
        )

    table = Table(title=f"Portal news (total: {total})")
    table.add_column("ID")
    table.add_column("Title")
    table.add_column("Author")
    table.add_column("Created")
    table.add_column("Attachments")
    for item in items:
        table.add_row(
            str(item["id"]),
            item["title"],
            item["author_username"],
            str(item["created_at"]),
            str(len(item["attachments"])),
        )
    console.print(table)


@news_app.command("add")
@async_command
async def news_add(
    title: str = typer.Argument(..., help="News post title"),
    author: str = typer.Option(..., help="Author username"),
    body: str = typer.Option(None, help="Post body text"),
    body_file: str = typer.Option(None, help="Read body from this file"),
    attachment: list[UUID] | None = typer.Option(
        None, "--attachment", help="Node ID of an attachment document (repeatable)"
    ),
):
    """Create a portal news post."""
    post_body = resolve_body(body, body_file, console)
    async with AsyncSessionLocal() as db_session:
        author_user = await get_user_by_username(db_session, author)
        if author_user is None:
            console.print(f"User [bold]{author}[/bold] not found", style="red")
            raise typer.Exit(1)
        try:
            item = await portal_dbapi.create_portal_news(
                db_session,
                user_id=author_user.id,
                title=title,
                body=post_body,
                attachment_node_ids=list(attachment or []),
                category=None,
                is_pinned=False,
            )
        except Exception as e:
            await db_session.rollback()
            console.print(f"Failed to create news: {e}", style="red")
            raise typer.Exit(1)
        await db_session.commit()

    console.print(
        f"News [bold]{item['title']}[/bold] created (id={item['id']})", style="green"
    )


@news_app.command("delete")
@async_command
async def news_delete(news_id: UUID = typer.Argument(..., help="News post ID")):
    """Delete a portal news post."""
    async with AsyncSessionLocal() as db_session:
        deleted = await portal_dbapi.delete_portal_news(db_session, news_id)
        await db_session.commit()
    if not deleted:
        console.print(f"News {news_id} not found", style="red")
        raise typer.Exit(1)
    console.print(f"News {news_id} deleted", style="green")
