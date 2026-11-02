import typer
from rich.console import Console
from rich.table import Table

from papermerge.core.db.engine import AsyncSessionLocal
from papermerge.core.features.feedback.db import api as feedback_dbapi
from papermerge.core.utils.cli import async_command, get_user_by_username, resolve_body

app = typer.Typer(help="Feedback (support threads, messages, wishes)")
console = Console()


@app.command("ls")
@async_command
async def threads_ls():
    """List feedback threads."""
    async with AsyncSessionLocal() as db_session:
        threads = await feedback_dbapi.list_threads(db_session)

    table = Table(title="Feedback threads")
    table.add_column("Thread ID")
    table.add_column("User")
    table.add_column("Last message")
    table.add_column("Preview")
    table.add_column("Unread (staff)")
    for thread, shown in threads:
        table.add_row(
            str(thread.id), shown, str(thread.last_message_at), thread.last_preview,
            str(thread.unread_for_staff),
        )
    console.print(table)


@app.command("messages")
@async_command
async def messages_ls(username: str = typer.Argument(..., help="User whose thread to show")):
    """List messages of a user's feedback thread."""
    async with AsyncSessionLocal() as db_session:
        user = await get_user_by_username(db_session, username)
        if user is None:
            console.print(f"User [bold]{username}[/bold] not found", style="red")
            raise typer.Exit(1)
        thread = await feedback_dbapi.get_thread_by_user(db_session, user.id)
        if thread is None:
            console.print("Thread does not exist yet (no messages)", style="yellow")
            return
        messages = await feedback_dbapi.list_messages(db_session, thread.id)

    table = Table(title=f"Messages ({username})")
    table.add_column("ID")
    table.add_column("Author")
    table.add_column("Staff?")
    table.add_column("Created")
    table.add_column("Body")
    for message, shown in messages:
        table.add_row(
            str(message.id), shown or "", "yes" if message.from_staff else "no",
            str(message.created_at), message.body,
        )
    console.print(table)


@app.command("message")
@async_command
async def message_add(
    username: str = typer.Option(..., "--user", help="Owner of the feedback thread"),
    author: str = typer.Option(..., "--author", help="Message author username"),
    body: str = typer.Option(None, help="Message text"),
    body_file: str = typer.Option(None, help="Read text from this file"),
    staff: bool = typer.Option(False, "--staff", help="Message sent by staff"),
):
    """Add a message to a user's feedback thread (creates the thread if missing)."""
    message_body = resolve_body(body, body_file, console)
    async with AsyncSessionLocal() as db_session:
        user = await get_user_by_username(db_session, username)
        if user is None:
            console.print(f"User [bold]{username}[/bold] not found", style="red")
            raise typer.Exit(1)
        author_user = await get_user_by_username(db_session, author)
        if author_user is None:
            console.print(f"User [bold]{author}[/bold] not found", style="red")
            raise typer.Exit(1)
        thread = await feedback_dbapi.get_or_create_thread(db_session, user.id)
        message = await feedback_dbapi.add_message(
            db_session,
            thread=thread,
            author_id=author_user.id,
            body=message_body,
            from_staff=staff,
        )
        await db_session.commit()

    console.print(
        f"Message added to thread {thread.id} (message id={message.id})", style="green"
    )


@app.command("wish")
@async_command
async def wish_add(
    author: str = typer.Option(..., help="Wish author username"),
    subject: str = typer.Option(..., help="Wish subject"),
    body: str = typer.Option(None, help="Wish text"),
    body_file: str = typer.Option(None, help="Read text from this file"),
):
    """Add a feedback wish (feature request)."""
    wish_body = resolve_body(body, body_file, console)
    async with AsyncSessionLocal() as db_session:
        author_user = await get_user_by_username(db_session, author)
        if author_user is None:
            console.print(f"User [bold]{author}[/bold] not found", style="red")
            raise typer.Exit(1)
        wish = await feedback_dbapi.add_wish(
            db_session,
            author_id=author_user.id,
            subject=subject,
            body=wish_body,
        )
        await db_session.commit()

    console.print(f"Wish created (id={wish.id})", style="green")
