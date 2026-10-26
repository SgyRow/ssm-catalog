import uuid

import typer
from rich.console import Console
from rich.table import Table

from papermerge.core.db.engine import AsyncSessionLocal
from papermerge.core.features.document.docx_migration import (
    find_docx_versions_needing_migration,
    migrate_docx_candidates,
)
from papermerge.core.utils.cli import async_command

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
