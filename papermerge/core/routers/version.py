from fastapi import APIRouter

from papermerge.core import schema
from papermerge.core.version import __version__

router = APIRouter(
    prefix="/version",
    tags=["version"],
)


@router.get("/")
async def get_version() -> schema.Version:
    """SSM-Catalog REST API version"""
    return schema.Version(version=__version__)
