import asyncio

import typer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


def async_command(async_func):
    """Decorator to make async functions work with typer"""
    from functools import wraps

    @wraps(async_func)
    def wrapper(*args, **kwargs):
        return asyncio.run(async_func(*args, **kwargs))

    return wrapper


async def get_user_by_username(db_session: AsyncSession, username: str):
    """Load a user row by username (None if not found)."""
    from papermerge.core import orm

    stmt = select(orm.User).where(orm.User.username == username)
    return (await db_session.execute(stmt)).scalar_one_or_none()


def resolve_body(body: str | None, body_file: str | None, console) -> str:
    """Take command text from --body or read it from --body-file."""
    if body_file:
        from pathlib import Path

        try:
            return Path(body_file).read_text(encoding="utf-8")
        except OSError as e:
            console.print(f"Cannot read {body_file}: {e}", style="red")
            raise typer.Exit(1)
    if body is None:
        console.print("Provide --body or --body-file", style="red")
        raise typer.Exit(1)
    return body
