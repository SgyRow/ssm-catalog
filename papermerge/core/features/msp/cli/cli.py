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
