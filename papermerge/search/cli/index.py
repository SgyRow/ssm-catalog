import os
import uuid
from typing import Optional

import typer
from rich import print_json, print
from typing_extensions import Annotated

from papermerge.core.utils.cli import async_command
from papermerge.search import indexing

app = typer.Typer(help="Index commands")

NodeIDsType = Annotated[Optional[list[uuid.UUID]], typer.Argument()]


@app.command("index")
@async_command
async def index_cmd(node_ids: NodeIDsType = None, dry_run: bool = False):
    if not os.environ.get("PAPERMERGE__SEARCH__URL"):
        print("[red][bold]PAPERMERGE__SEARCH__URL[/bold] is missing[/red]")
        print("Please set [bold]PAPERMERGE__SEARCH__URL[/bold] environment variable")
        raise typer.Exit(code=1)

    from papermerge.core.db.engine import AsyncSessionLocal

    ids = node_ids or []
    async with AsyncSessionLocal() as db_session:
        items = await indexing.build_index_items(db_session, ids)

    if dry_run:
        for item in items:
            print_json(data=item.model_dump())
        return

    index = indexing.get_index_rw()
    for item in items:
        index.add(item)
