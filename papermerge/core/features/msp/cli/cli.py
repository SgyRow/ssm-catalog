from __future__ import annotations

import typer
from rich.console import Console
from rich.table import Table

from papermerge.core.db.engine import AsyncSessionLocal
from papermerge.core.features.msp.db import api as msp_dbapi
from papermerge.core.features.msp import pdf as msp_pdf
from papermerge.core.utils.cli import async_command

app = typer.Typer(help="Measures of Social Support (МСП)")
console = Console()


@app.command("types")
@async_command
async def types_ls():
    """List all measure types."""
    async with AsyncSessionLocal() as db_session:
        msp_types = await msp_dbapi.list_msp_types(db_session)

    table = Table(title="Меры (виды МСП)")
    table.add_column("ID")
    table.add_column("Название")
    table.add_column("Разделов")
    for msp_type in msp_types:
        table.add_row(
            str(msp_type.id),
            msp_type.name,
            str(len(msp_type.sections)),
        )
    console.print(table)


@app.command("ls")
@async_command
async def msp_ls():
    """List all measures."""
    async with AsyncSessionLocal() as db_session:
        msps = await msp_dbapi.list_msps(db_session)

    table = Table(title="Меры (МСП)")
    table.add_column("ID")
    table.add_column("Node")
    table.add_column("Вид")
    table.add_column("Разделов")
    for msp in msps:
        table.add_row(
            str(msp.id),
            str(msp.node_id),
            msp.msp_type.name if msp.msp_type else "",
            str(len(msp.sections)),
        )
    console.print(table)


@app.command("ensure-normative-registry")
@async_command
async def ensure_normative_registry():
    """Create the central NPA folder under the portal root if missing."""
    async with AsyncSessionLocal() as db_session:
        registry_id, buckets, err = await msp_dbapi.ensure_normative_registry(
            db_session
        )
        if err:
            console.print(err, style="red")
            raise typer.Exit(1)
        await db_session.commit()
    console.print(
        f"Registry folder_id={registry_id} buckets={buckets}", style="green"
    )


@app.command("npa-reorg")
@async_command
async def npa_reorg(
    apply: bool = typer.Option(
        False,
        "--apply",
        help="Apply changes (default is dry-run)",
    ),
    rebind_only: bool = typer.Option(
        False,
        "--rebind-only",
        help="Only rebuild measure virtual folders (skip physical moves)",
    ),
):
    """Move NPA docs into type subfolders and rebind measure virtual folders."""
    from papermerge.core.features.msp.npa_reorg import (
        rebind_measure_folders,
        reorganize_registry,
        run_full_reorg,
    )

    dry_run = not apply
    async with AsyncSessionLocal() as db_session:
        if rebind_only:
            phys = None
            virt = await rebind_measure_folders(db_session, dry_run=dry_run)
            if not dry_run:
                await db_session.commit()
        else:
            phys, virt = await run_full_reorg(db_session, dry_run=dry_run)

    mode = "DRY-RUN" if dry_run else "APPLIED"
    if phys is not None:
        console.print(
            f"[bold]{mode}[/bold] physical moves={len(phys.moved)} "
            f"already_typed={phys.already_typed} "
            f"new_type_folders={len(phys.created_type_folders)}"
        )
        for line in phys.moved[:20]:
            console.print(f"  move: {line}")
        if len(phys.moved) > 20:
            console.print(f"  ... +{len(phys.moved) - 20} more")
        for err in phys.errors:
            console.print(f"[red]{err}[/red]")
    console.print(
        f"[bold]{mode}[/bold] rebound_links={virt.rebound_links} "
        f"created_virtual={len(set(virt.created_virtual))} "
        f"deleted_virtual={len(virt.deleted_virtual)}"
    )
    for title in sorted(set(virt.created_virtual))[:30]:
        console.print(f"  +virtual: {title}")
    for err in virt.errors:
        console.print(f"[red]{err}[/red]")
    errs = list(virt.errors)
    if phys is not None:
        errs.extend(phys.errors)
    if errs:
        raise typer.Exit(1)


@app.command("npa-dedupe")
@async_command
async def npa_dedupe(
    apply: bool = typer.Option(
        False,
        "--apply",
        help="Apply changes (default is dry-run)",
    ),
):
    """Keep newest NPA edition per act; soft-delete older duplicates."""
    from papermerge.core.features.msp.npa_aktual import dedupe_editions

    dry_run = not apply
    async with AsyncSessionLocal() as db_session:
        report = await dedupe_editions(db_session, dry_run=dry_run)

    mode = "DRY-RUN" if dry_run else "APPLIED"
    console.print(
        f"[bold]{mode}[/bold] groups={report.groups} kept={report.kept} "
        f"retire={report.retired} links_repointed={report.links_repointed} "
        f"ambiguous={len(report.skipped_ambiguous)}"
    )
    for title in report.retired_titles[:25]:
        console.print(f"  retire: {title}")
    if len(report.retired_titles) > 25:
        console.print(f"  ... +{len(report.retired_titles) - 25} more")
    console.print(
        f"external_check_candidates={len(report.check_candidates)}"
    )
    for title in report.check_candidates[:20]:
        console.print(f"  check: {title}")
    for err in report.errors:
        console.print(f"[red]{err}[/red]")
    if report.errors:
        raise typer.Exit(1)


@app.command("pdf")
@async_command
async def msp_pdf_render(
    msp_id: str = typer.Argument(..., help="Measure ID"),
    output: str = typer.Option(None, "-o", "--output", help="Output file"),
):
    """Render a measure to a PDF file."""
    from uuid import UUID

    from sqlalchemy import select

    from papermerge.core.features.nodes.db import orm as nodes_orm

    async with AsyncSessionLocal() as db_session:
        msp = await msp_dbapi.get_msp(db_session, UUID(msp_id))
        if msp is None:
            console.print("[red]Measure not found[/red]")
            return
        stmt = select(nodes_orm.Node.title).where(nodes_orm.Node.id == msp.node_id)
        title = (await db_session.execute(stmt)).scalar_one_or_none() or "Мера"
        data = msp_pdf.render_msp_pdf(msp, title)

    if output is None:
        import sys

        sys.stdout.buffer.write(data)
    else:
        with open(output, "wb") as f:
            f.write(data)
        console.print(f"[green]Saved[/green] {output} ({len(data)} bytes)")
