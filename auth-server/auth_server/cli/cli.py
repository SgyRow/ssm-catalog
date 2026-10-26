import typer

from auth_server.cli import users
from auth_server.cli import tokens

app = typer.Typer(help="Papermerge Auth server command line tool")

app.add_typer(users.app, name="users")
app.add_typer(tokens.app, name="tokens")

if __name__ == "__main__":
    app()
