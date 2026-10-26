"""Convert DOCX uploads to PDF via Gotenberg (LibreOffice)."""

from __future__ import annotations

import logging
import socket
from urllib.parse import urlparse

import httpx

from papermerge.core import config
from papermerge.core.features.document.upload_text import DOCX_CONTENT_TYPE

logger = logging.getLogger(__name__)

DOCX_EXTENSIONS = frozenset({".docx"})
# Gotenberg/LibreOffice is sensitive to very long or non-ASCII multipart names.
GOTENBERG_UPLOAD_NAME = "document.docx"


class DocxConversionError(Exception):
    """Raised when Gotenberg cannot produce a PDF from a DOCX upload."""


def is_legacy_docx_version(file_name: str | None) -> bool:
    if not file_name:
        return False
    lower = file_name.lower()
    return lower.endswith(".docx") and not lower.endswith(".docx.pdf")


def pdf_companion_name(docx_file_name: str) -> str:
    return f"{docx_file_name}.pdf"


def is_docx_upload(*, content_type: str, file_name: str) -> bool:
    ext = _file_ext(file_name)
    if ext in DOCX_EXTENSIONS:
        return True
    return content_type.split(";")[0].strip().lower() == DOCX_CONTENT_TYPE


def _file_ext(file_name: str) -> str:
    dot = (file_name or "").rfind(".")
    if dot < 0:
        return ""
    return file_name[dot:].lower()


def resolve_gotenberg_base_url(raw_url: str) -> str:
    """
    Return a reachable Gotenberg base URL.

    Docker Compose uses ``http://gotenberg:3000``; on the Windows/Linux host
    that hostname does not resolve, so fall back to localhost.
    """
    base_url = raw_url.strip().rstrip("/")
    if not base_url:
        raise DocxConversionError("DOCX preview conversion is not configured")

    parsed = urlparse(base_url)
    host = parsed.hostname
    if not host:
        return base_url

    port = parsed.port or 3000
    try:
        socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        return base_url
    except OSError:
        if host == "gotenberg":
            scheme = parsed.scheme or "http"
            resolved = f"{scheme}://127.0.0.1:{port}"
            logger.info("Gotenberg host %r unreachable; using %s", host, resolved)
            return resolved
        raise DocxConversionError(
            f"Cannot reach Gotenberg at {base_url!r} ({host} does not resolve)"
        ) from None


async def convert_docx_to_pdf(content: bytes, file_name: str) -> bytes:
    """
    Send DOCX bytes to Gotenberg and return PDF bytes.

    See https://gotenberg.dev/docs/routes#libreoffice-convert-with-writer
    """
    settings = config.get_settings()
    base_url = resolve_gotenberg_base_url(settings.papermerge__main__gotenberg_url or "")

    timeout = httpx.Timeout(
        settings.papermerge__main__gotenberg_timeout_seconds,
        connect=15.0,
    )

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{base_url}/forms/libreoffice/convert",
                files={"files": (GOTENBERG_UPLOAD_NAME, content, DOCX_CONTENT_TYPE)},
            )
    except httpx.HTTPError as exc:
        logger.warning(
            "Gotenberg DOCX conversion transport error file=%s url=%s: %s",
            file_name,
            base_url,
            exc,
        )
        raise DocxConversionError(
            f"Word to PDF conversion failed: cannot reach Gotenberg at {base_url}"
        ) from exc

    if response.status_code != 200:
        detail = response.text.strip()[:500]
        logger.warning(
            "Gotenberg DOCX conversion failed status=%s file=%s detail=%s",
            response.status_code,
            file_name,
            detail,
        )
        raise DocxConversionError(
            f"Word to PDF conversion failed (HTTP {response.status_code})"
        )

    pdf = response.content
    if not pdf.startswith(b"%PDF"):
        raise DocxConversionError("Word to PDF conversion returned invalid data")

    return pdf
