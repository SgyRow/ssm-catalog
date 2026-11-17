"""Convert uploads to PDF using the same rules as library document upload.

Library document upload keeps the original bytes as one version and stores a
derived PDF as another. Callers that only keep a single file (e.g. handbook)
should persist the returned payload, which is already PDF when conversion
applies.
"""

from __future__ import annotations

import mimetypes

import img2pdf

from papermerge.core import constants
from papermerge.core.features.document.docx_convert import (
    DocxConversionError,
    convert_docx_to_pdf,
    is_docx_upload,
)
from papermerge.core.utils.misc import normalize_upload_file_name

IMAGE_MIMES_IMG2PDF = frozenset(
    {
        constants.ContentType.IMAGE_JPEG,
        constants.ContentType.IMAGE_PNG,
        constants.ContentType.IMAGE_TIFF,
        "image/jpg",
    }
)


class UploadPdfConversionError(Exception):
    """Raised when an upload that should become PDF cannot be converted."""


def normalize_upload_content_type(
    content_type: str | None, file_name: str | None
) -> str:
    if content_type:
        ct = content_type.split(";")[0].strip().lower()
        if ct and ct != "application/octet-stream":
            return ct
    guessed, _ = mimetypes.guess_type(file_name or "")
    return (guessed or "application/octet-stream").lower()


async def convert_upload_to_pdf_payload(
    *,
    data: bytes,
    file_name: str,
    content_type: str | None,
) -> tuple[bytes, str, str]:
    """
    Apply library upload conversion rules to a single stored payload.

    Returns ``(payload, stored_file_name, content_type)``.
    Images (JPEG/PNG/TIFF) and DOCX become PDF bytes named ``{name}.pdf``.
    PDF and all other types are returned unchanged.
    """
    safe_name = normalize_upload_file_name(file_name)
    ct = normalize_upload_content_type(content_type, safe_name)

    if ct == constants.ContentType.APPLICATION_PDF:
        return data, safe_name, ct

    if ct in IMAGE_MIMES_IMG2PDF:
        try:
            pdf_content = img2pdf.convert(data)
        except img2pdf.ImageOpenError as exc:
            raise UploadPdfConversionError(str(exc)) from exc
        return (
            pdf_content,
            f"{safe_name}.pdf",
            constants.ContentType.APPLICATION_PDF,
        )

    if is_docx_upload(content_type=ct, file_name=safe_name):
        try:
            pdf_content = await convert_docx_to_pdf(data, safe_name)
        except DocxConversionError as exc:
            raise UploadPdfConversionError(str(exc)) from exc
        return (
            pdf_content,
            f"{safe_name}.pdf",
            constants.ContentType.APPLICATION_PDF,
        )

    return data, safe_name, ct
