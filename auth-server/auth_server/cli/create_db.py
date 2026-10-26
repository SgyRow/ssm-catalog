import click

from auth_server.db.base import Base
from auth_server.db.engine import engine
# loads user model into Base.metadata so that engine can create it
from auth_server.models import User  # noqa


@click.command()
def cli():
    Base.metadata.create_all(engine)


if __name__ == '__main__':
    click.echo("Creating database...")
    cli()
