import typer
from rich.console import Console
from typing_extensions import Annotated
from auth_server.backends import ldap


app = typer.Typer()
console = Console()

Password = Annotated[
    str,
    typer.Option(
        prompt=True,
        confirmation_prompt=False,
        hide_input=True
    )
]


@app.command()
def auth(username: str, password: Password):
    """Authenticates user with credentials"""
    client = ldap.get_client(username, password)
    try:
        client._signin()
        console.print("Authentication success", style="green")
    except Exception:
        console.print("Authentication failed", style="red")


@app.command()
def user_email(username: str, password: Password):
    """Prints user email as retrieved from LDAP"""
    client = ldap.get_client(username, password)
    try:
        client._signin()
        console.print(f"User email: {client._user_email()}")
    except Exception:
        console.print("Authentication error", style="red")


if __name__ == '__main__':
    app()
