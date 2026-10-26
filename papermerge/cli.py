import typer

from papermerge.core.cli import perms as perms_cli
from papermerge.core.cli import scopes as scopes_cli
from papermerge.core.features.users.cli import cli as usr_cli
from papermerge.core.features.groups.cli import cli as groups_cli
from papermerge.core.features.roles.cli import cli as roles_cli
from papermerge.core.cli import token as token_cli
from papermerge.search.cli import search
from papermerge.search.cli import index
from papermerge.search.cli import index_schema
from papermerge.core.cli.library_seed import app as library_seed_app
from papermerge.core.features.portal.cli.cli import app as portal_cli
from papermerge.core.features.library_ts.cli.cli import app as library_cli
from papermerge.core.features.document.cli.cli import app as documents_cli

app = typer.Typer(help="Papermerge DMS command line management tool")
app.add_typer(usr_cli.app, name="users")
app.add_typer(groups_cli.app, name="groups")
app.add_typer(roles_cli.app, name="roles")
app.add_typer(perms_cli.app, name="perms")
app.add_typer(scopes_cli.app, name="scopes")
app.add_typer(token_cli.app, name="tokens")
app.add_typer(search.app, name="search")
app.add_typer(index.app, name="index")
app.add_typer(index_schema.app, name="index-schema")
app.add_typer(library_seed_app, name="library-seed")
app.add_typer(portal_cli, name="portal")
app.add_typer(library_cli, name="library")
app.add_typer(documents_cli, name="documents")


def main():
    app()

