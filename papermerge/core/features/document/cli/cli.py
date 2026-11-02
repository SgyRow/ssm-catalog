import io
import uuid
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table
from sqlalchemy import select

from papermerge.core import orm
from papermerge.core.db.engine import AsyncSessionLocal
from papermerge.core.features.document import schema as doc_schema
from papermerge.core.features.document.db import api as doc_dbapi
from papermerge.core.features.document.docx_migration import (
    find_docx_versions_needing_migration,
    migrate_docx_candidates,
)
from papermerge.core.features.nodes.db import api as nodes_dbapi
from papermerge.core.utils.cli import async_command, get_user_by_username

app = typer.Typer(help="Document maintenance commands")


@app.command("convert-docx")
@async_command
async def convert_docx(
    portal_only: bool = typer.Option(
        True,
        "--portal-only/--all",
        help="Convert only documents under the legal portal tree (default).",
    ),
    dry_run: bool = typer.Option(
        False,
        "--dry-run",
        help="List candidates without converting.",
    ),
    document_id: uuid.UUID | None = typer.Option(
        None,
        "--document-id",
        help="Convert a single document (must still match scope filters).",
    ),
):
    """
    Backfill PDF preview versions for legacy .docx uploads.

    Keeps the original Word file as an earlier document version and appends a
    derived PDF version so the viewer uses the same PDF preview as new uploads.
    """
    console = Console()
    doc_ids = [document_id] if document_id else None

    async with AsyncSessionLocal() as db_session:
        candidates = await find_docx_versions_needing_migration(
            db_session,
            portal_only=portal_only,
            document_ids=doc_ids,
        )

        if not candidates:
            scope = "portal" if portal_only else "all documents"
            console.print(f"No legacy DOCX files need conversion in {scope}.")
            return

        table = Table(title="Legacy DOCX files pending PDF backfill")
        table.add_column("Document ID")
        table.add_column("Version ID")
        table.add_column("File name")
        for doc_id, ver_id, name in candidates:
            table.add_row(str(doc_id), str(ver_id), name)
        console.print(table)
        console.print(f"Total: {len(candidates)}")

        if dry_run:
            console.print("Dry run — no conversions performed.", style="yellow")
            return

        converted, failed, errors = await migrate_docx_candidates(
            db_session, candidates
        )

    console.print(f"Converted: {converted}", style="green")
    if failed:
        console.print(f"Failed: {failed}", style="red")
        for line in errors:
            console.print(f"  • {line}", style="red")
        raise typer.Exit(1)


@app.command("add")
@async_command
async def add_document(
    path: Path = typer.Argument(..., help="Local file to upload as a document"),
    title: str = typer.Option(None, help="Document title (default: file name)"),
    parent_id: uuid.UUID = typer.Option(None, help="Parent folder node ID"),
    username: str = typer.Option(None, "--user", help="Create under this user's home folder"),
):
    """Create a document from a local file (parent: --parent-id or --user home)."""
    console = Console()
    if not path.is_file():
        console.print(f"File not found: {path}", style="red")
        raise typer.Exit(1)
    if parent_id is None and username is None:
        console.print("Specify --parent-id or --user <username>", style="red")
        raise typer.Exit(1)

    data = path.read_bytes()
    async with AsyncSessionLocal() as db_session:
        parent = parent_id
        if parent is None:
            user = await get_user_by_username(db_session, username)
            if user is None:
                console.print(f"User [bold]{username}[/bold] not found", style="red")
                raise typer.Exit(1)
            parent = user.home_folder_id

        doc, err = await doc_dbapi.create_document(
            db_session,
            doc_schema.NewDocument(
                title=title or path.name,
                parent_id=parent,
                file_name=path.name,
            ),
        )
        if err or doc is None:
            _print_error(err, console)
            raise typer.Exit(1)

        uploaded, err = await doc_dbapi.upload(
            db_session, doc.id, io.BytesIO(data), len(data), path.name
        )
        if err or uploaded is None:
            _print_error(err, console)
            raise typer.Exit(1)

    console.print(
        f"Document [bold]{uploaded.title}[/bold] added (id={uploaded.id})", style="green"
    )


@app.command("ls")
@async_command
async def list_documents(page_size: int = 20, page_number: int = 1):
    """List documents (last updated first)."""
    console = Console()
    async with AsyncSessionLocal() as db_session:
        stmt = (
            select(orm.Document)
            .where(orm.Node.deleted_at.is_(None))
            .order_by(orm.Document.updated_at.desc())
            .limit(page_size)
            .offset(page_size * (page_number - 1))
        )
        docs = (await db_session.execute(stmt)).scalars().all()

    table = Table(title=f"Documents (page {page_number}, {page_size} per page)")
    table.add_column("ID")
    table.add_column("Title")
    table.add_column("Parent")
    table.add_column("Updated")
    for doc in docs:
        table.add_row(str(doc.id), doc.title, str(doc.parent_id), str(doc.updated_at))
    console.print(table)


def _print_error(err, console):
    if err is None:
        console.print("Unknown error", style="red")
        return
    messages = [a.message for a in (err.attrs or [])]
    if not messages:
        messages = [" ; ".join(err.messages or [])] or ["Unknown error"]
    for line in messages:
        console.print(line, style="red")


@app.command("delete")
@async_command
async def delete_document(
    document_id: uuid.UUID = typer.Argument(..., help="Document node ID"),
    username: str = typer.Option(
        "admin", "--user", help="Actor username for the audit log"
    ),
):
    """Move a document to trash (soft delete, descendants included)."""
    console = Console()
    async with AsyncSessionLocal() as db_session:
        node = (
            await db_session.execute(
                select(orm.Node).where(orm.Node.id == document_id)
            )
        ).scalar_one_or_none()
        if node is None:
            console.print(f"Node {document_id} not found", style="red")
            raise typer.Exit(1)
        if node.ctype != "document":
            console.print(
                f"Node {document_id} is not a document (ctype={node.ctype})",
                style="red",
            )
            raise typer.Exit(1)
        actor = await get_user_by_username(db_session, username)
        if actor is None:
            console.print(f"User [bold]{username}[/bold] not found", style="red")
            raise typer.Exit(1)
        err = await nodes_dbapi.delete_nodes(db_session, [document_id], actor.id)
    if err:
        console.print(" ".join(err.messages or ["unknown error"]), style="red")
        raise typer.Exit(1)
    console.print(f"Document {document_id} moved to trash", style="green")
