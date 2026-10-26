from typing import Annotated

from fastapi import APIRouter, Security

from papermerge.core import constants, schema
from papermerge.core import config
from papermerge.core.features.auth import get_current_user, scopes
from papermerge.core import tasks

from .schema import OCRTaskIn

router = APIRouter(
    prefix="/tasks",
    tags=["tasks"],
)
settings = config.get_settings()


@router.post("/ocr")
def start_ocr(
    ocr_task: OCRTaskIn,
    user: Annotated[schema.User, Security(get_current_user, scopes=[scopes.TASK_OCR])],
):
    """Triggers OCR for specific document

    """
    if not settings.papermerge__ocr__enabled:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="OCR is disabled")

    tasks.send_task(
        constants.WORKER_OCR_DOCUMENT,
        kwargs={
            "document_id": str(ocr_task.document_id),
            # Legacy clients may still send `lang`, but OCR now runs with
            # system multilingual codes by default.
            "lang": ocr_task.lang or settings.papermerge__ocr__multi_lang_codes,
        },
        route_name="ocr",
    )
