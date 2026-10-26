import typer
import logging

from rich.console import Console
from sqlalchemy.exc import NoResultFound

from auth_server.db.engine import Session
from auth_server.auth import create_token
from auth_server.db import api as dbapi


app = typer.Typer(help="User management")
logger = logging.getLogger(__name__)
console = Console()


@app.command(name="create")
def create_token_cmd(username: str):
    """Creates token for given user"""

    with Session() as db_session:
        try:
            user = dbapi.get_user_by_username(db_session, username)
        except NoResultFound:
            pass

    if user is None:
        logger.warning(f"User username='{username}' not found")
        return

    token = create_token(user)

    console.print(token)
    logger.info(token)


if __name__ == "__main__":
    app()
