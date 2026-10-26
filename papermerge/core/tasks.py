import logging

from papermerge.celery_app import app as celery_app
from papermerge.core.utils.decorators import if_redis_present

logger = logging.getLogger(__name__)


@if_redis_present
def send_task(*args, **kwargs):
    """Fire-and-forget task dispatch that never breaks the request path.

    Celery's broker transport options already limit retries (see
    ``papermerge.celery_app``); here we additionally swallow any broker error
    so an unavailable Redis/RabbitMQ cannot cascade into 500s for API handlers
    that schedule background work (OCR, indexing, S3 upload, previews, etc.).
    """
    logger.debug("Send task args=%s kwargs=%s", args, kwargs)
    try:
        celery_app.send_task(*args, **kwargs)
        return True
    except Exception:
        logger.exception("Failed to dispatch celery task args=%s kwargs=%s", args, kwargs)
        return False
