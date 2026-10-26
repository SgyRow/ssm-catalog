"""Seed folders, custom fields, and document types for the course TS library."""

import typer
from rich.console import Console
from sqlalchemy import select

from papermerge.core import orm
from papermerge.core.db.engine import AsyncSessionLocal
from papermerge.core.features.custom_fields import schema as cf_schema
from papermerge.core.features.custom_fields.db import api as cf_dbapi
from papermerge.core.features.document_types.db import api as dt_dbapi
from papermerge.core.features.nodes import schema as nodes_schema
from papermerge.core.features.nodes.db import api as nodes_dbapi
from papermerge.core.utils.cli import async_command

app = typer.Typer(
    help="Seed «Электронная библиотека Хабаровского центра социальной поддержки населения» taxonomy (custom fields, types, folders)"
)


FOLDER_TREE = (
    "Нормативно-правовые акты",
    "Методические материалы",
    "Практические руководства",
    "Инструкции",
    "Локальные документы",
    "Шаблоны",
    "Тематика: меры социальной поддержки",
    "Тематика: целевые группы",
)


@app.command()
@async_command
async def seed(username: str = typer.Argument(..., help="Login of the user who owns the seed data")):
    """Create custom fields, document types, and a folder tree under the user's home folder."""
    console = Console()
    async with AsyncSessionLocal() as session:
        u = await session.scalar(select(orm.User).where(orm.User.username == username))
        if u is None:
            console.print(f"[red]User {username!r} not found[/red]")
            raise typer.Exit(1)
        parent_id = u.home_folder_id

        cf_thematic = await cf_dbapi.create_custom_field(
            session,
            name="Тематика",
            type=cf_schema.CustomFieldType.text,
            user_id=u.id,
        )
        cf_secrecy = await cf_dbapi.create_custom_field(
            session,
            name="Уровень секретности",
            type=cf_schema.CustomFieldType.text,
            user_id=u.id,
        )
        cf_pub = await cf_dbapi.create_custom_field(
            session,
            name="Дата публикации или изменения",
            type=cf_schema.CustomFieldType.date,
            user_id=u.id,
        )
        cf_ids = [cf_thematic.id, cf_secrecy.id, cf_pub.id]

        type_names = (
            "Нормативно-правовые акты",
            "Методические материалы",
            "Практические руководства",
            "Инструкции",
            "Локальные документы",
            "Шаблоны",
        )
        for name in type_names:
            await dt_dbapi.create_document_type(
                session,
                name=name,
                user_id=u.id,
                custom_field_ids=cf_ids,
            )

        for title in FOLDER_TREE:
            nf = nodes_schema.NewFolder(title=title, parent_id=parent_id, id=None)
            folder, err = await nodes_dbapi.create_folder(session, nf)
            if err:
                console.print(f"[yellow]Skip {title}: {err}[/yellow]")
                continue
            console.print(f"[green]Folder[/green] {title} ({folder.id})")

    console.print("[bold green]Done.[/bold green] Assign document types in the UI as needed.")
