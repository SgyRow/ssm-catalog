import typer
from rich.console import Console
from rich.table import Table
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from papermerge.core import orm
from papermerge.core.db.engine import AsyncSessionLocal
from papermerge.core.features.auth import scopes
from papermerge.core.features.roles import schema
from papermerge.core.features.roles.db import api as roles_dbapi
from papermerge.core.features.roles import test_role_presets
from papermerge.core.utils.cli import async_command


app = typer.Typer(
    help="Role management (built-ins: admin, moderator, employee)"
)


@app.command()
@async_command
async def create_admin(exists_ok: bool = True):
    """Create or refresh role ``admin`` with every permission (idempotent)."""
    _ = exists_ok  # Typer CLI flag kept for backward compatibility
    all_scopes = sorted(scopes.Scopes.all_scopes())
    console = Console()
    async with AsyncSessionLocal() as db_session:
        stmt = select(orm.Role).where(orm.Role.name == "admin")
        existing = (await db_session.execute(stmt)).scalar_one_or_none()
        if existing:
            attrs = schema.UpdateRole(name="admin", scopes=all_scopes)
            _, error = await roles_dbapi.update_role(db_session, existing.id, attrs)
            if error:
                console.print(error, style="red")
                raise typer.Exit(1)
            rid = existing.id
        else:
            role, error = await roles_dbapi.create_role(
                db_session, name="admin", scopes=all_scopes, exists_ok=False
            )
            if error:
                console.print(error, style="red")
                raise typer.Exit(1)
            rid = role.id
    console.print(f"Role [bold]admin[/bold] ready (id={rid})", style="green")


@app.command("ls")
@async_command
async def list_roles():
    """List existing roles and their scopes."""
    async with AsyncSessionLocal() as session:
        stmt = select(orm.Role).options(selectinload(orm.Role.permissions))
        result = await session.execute(stmt)
        db_items = result.scalars().unique().all()
        rows = []
        for item in db_items:
            role = dict(name=item.name, id=item.id)
            role["scopes"] = [p.codename for p in item.permissions]
            rows.append(schema.RoleDetails.model_validate(role))

    console = Console()
    for g in rows:
        console.print(f"Name={g.name}")
        console.print(f"Scopes={','.join(g.scopes)}")


@app.command("seed-test-roles")
@async_command
async def seed_test_roles():
    """Seed moderator/employee roles and remove legacy worker/modder/editor_ts/reader_ts.

    Run ``paper-cli perms sync`` first so permission rows exist.
    """
    console = Console()
    async with AsyncSessionLocal() as db_session:
        results = await test_role_presets.ensure_all_preset_roles(db_session)

    table = Table(title="Built-in roles")
    table.add_column("Role", style="cyan")
    table.add_column("# perms", style="green")
    table.add_column("Status", style="magenta")

    for name, details, err in results:
        if err:
            table.add_row(name, "", err)
        else:
            n = len(details.scopes) if details else 0
            table.add_row(name, str(n), "ok")

    console.print(table)

    for name, details, err in results:
        if err:
            console.print(f"[{name}] {err}", style="red")
            raise typer.Exit(1)
        if details:
            console.print(
                f"[bold]{name}[/bold]: {len(details.scopes)} permission(s) configured"
            )


@app.command("seed-test-role")
@async_command
async def seed_one_test_role(
    name: str = typer.Argument(
        ...,
        help="Preset: moderator | employee",
    ),
):
    """Create or update a single preset role."""
    console = Console()
    async with AsyncSessionLocal() as db_session:
        details, err = await test_role_presets.ensure_preset_role(db_session, name)

    if err:
        console.print(err, style="red")
        raise typer.Exit(1)
    console.print(
        f"Role [bold]{details.name}[/bold] has {len(details.scopes)} permission(s)",
        style="green",
    )
