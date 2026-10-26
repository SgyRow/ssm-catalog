import typer
import logging

from rich.console import Console
from typing_extensions import Annotated
from sqlalchemy.exc import NoResultFound
from sqlalchemy.orm import sessionmaker
from auth_server.db.engine import Session
from auth_server.db import api as dbapi
from auth_server.auth import db_auth

app = typer.Typer(help="User management")
logger = logging.getLogger(__name__)

console = Console()

Username = Annotated[str, typer.Argument(envvar="PAPERMERGE__AUTH__USERNAME")]
Email = Annotated[str, typer.Argument(envvar="PAPERMERGE__AUTH__EMAIL")]
Password = Annotated[str, typer.Argument(envvar="PAPERMERGE__AUTH__PASSWORD")]


@app.command(name="create")
def create_user(
    password: Password,
    username: Username,
    email: Email | None = None,
    superuser: bool = False,
):
    """Creates a user"""

    if not email:
        email = f"{username}@example.com"

    user = None
    with Session() as db_session:
        try:
            user = dbapi.get_user_by_username(db_session, username)
            logger.info(f"User '{username}' already exists.")
            console.print(f"User {username} already exists", style="yellow")
        except NoResultFound:
            pass

        if user is None:
            dbapi.create_user(
                db_session,
                username=username,
                password=password,
                email=email,
                is_superuser=superuser,
            )
            logger.info(f"User '{username}' created.")
            console.print(f"User {username} created", style="green")


@app.command(name="ls")
def list_users():
    """Lists all users"""

    with Session() as db_session:
        users = dbapi.get_users(db_session)

    for user in users:
        print(f"id={user.id} username={user.username} email={user.email}")


PromptUsername = Annotated[str, typer.Option(prompt=True)]
PromptPassword = Annotated[
    str, typer.Option(prompt=True, confirmation_prompt=True, hide_input=True)
]


@app.command(name="passwd")
def set_password(username: PromptUsername, password: PromptPassword):
    """Sets user password"""

    with Session() as db_session:
        user = dbapi.set_user_password(db_session, username=username, password=password)

    if user:
        console.print("Password successfully updated", style="green")


PromptPassword2 = Annotated[str, typer.Option(prompt=True, hide_input=True)]


@app.command(name="auth")
def check_credentials(username: PromptUsername, password: PromptPassword2):
    """Checks user credentials"""

    with Session() as db_session:
        user = db_auth(db_session, username, password)

        if user:
            console.print("[bold]Correct[/bold] credentials", style="green")
        else:
            console.print("[bold]Wrong[/bold] credentials", style="red")


if __name__ == "__main__":
    app()
