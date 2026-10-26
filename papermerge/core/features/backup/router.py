import asyncio
import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from papermerge.core import exceptions as exc
from papermerge.core.db.engine import get_db
from papermerge.core.features.auth import get_current_user
from papermerge.core.features.backup.service import (
    assert_backup_tools_available,
    prepare_backup_staging,
    restore_backup,
    stream_backup_archive,
)
from papermerge.core.features.users import schema as users_schema

router = APIRouter(prefix="/admin/backup", tags=["admin-backup"])

_EXPORT_HEADERS = {
    "Content-Disposition": 'attachment; filename="papermerge-backup.pmgbackup"',
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no",
}


def _require_superuser(user: users_schema.User) -> users_schema.User:
    if not user.is_superuser:
        raise exc.HTTP403Forbidden()
    return user


@router.get("/export")
async def export_backup(
    request: Request,
    user: users_schema.User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db),
):
    _require_superuser(user)
    # Release the request connection before pg_dump and the long media stream.
    await db_session.close()

    if request.query_params.get("probe") == "1":
        try:
            assert_backup_tools_available()
        except Exception as exc_:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=str(exc_)) from exc_
        return {"status": "ok"}

    try:
        staging, _manifest = await asyncio.to_thread(prepare_backup_staging)
    except Exception as exc_:  # noqa: BLE001
        raise HTTPException(
            status_code=500, detail=f"Backup export failed: {exc_}"
        ) from exc_

    async def body():
        try:
            async for chunk in stream_backup_archive(staging):
                yield chunk
        finally:
            shutil.rmtree(staging, ignore_errors=True)

    return StreamingResponse(
        body(),
        media_type="application/gzip",
        headers=_EXPORT_HEADERS,
    )


@router.post("/import")
async def import_backup(
    backup: UploadFile = File(...),
    user: users_schema.User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db),
):
    _require_superuser(user)
    if not backup.filename or not backup.filename.lower().endswith((".pmgbackup", ".tar.gz", ".tgz")):
        raise HTTPException(status_code=400, detail="Unsupported backup file format")

    temp = tempfile.NamedTemporaryFile(prefix="papermerge-restore-", suffix=".pmgbackup", delete=False)
    path = Path(temp.name)
    try:
        while chunk := await backup.read(1024 * 1024):
            temp.write(chunk)
        temp.close()
        # Release the request's SQLAlchemy connection before pg_restore drops
        # and recreates the application's tables.
        await db_session.close()
        # Keep the event loop free so the healthcheck is not failed mid-restore.
        manifest = await asyncio.to_thread(restore_backup, path)
        return {
            "status": "ok",
            "message": "Backup restored successfully. Reload the application.",
            "created_at": manifest.get("created_at"),
        }
    except Exception as exc_:  # noqa: BLE001
        temp.close()
        raise HTTPException(status_code=400, detail=f"Backup restore failed: {exc_}") from exc_
    finally:
        path.unlink(missing_ok=True)
