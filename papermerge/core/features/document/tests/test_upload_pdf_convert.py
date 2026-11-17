import io
import zipfile

import pytest
from pikepdf import Pdf
from PIL import Image


def _minimal_docx_bytes() -> bytes:
    buf = io.BytesIO()
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body><w:p><w:r><w:t>Handbook DOCX</w:t></w:r></w:p></w:body>"
        "</w:document>"
    )
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("word/document.xml", document_xml)
    return buf.getvalue()


def _minimal_pdf_bytes() -> bytes:
    pdf = Pdf.new()
    pdf.add_blank_page(page_size=(612, 792))
    out = io.BytesIO()
    pdf.save(out)
    return out.getvalue()


def _minimal_png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color=(255, 0, 0)).save(buf, format="PNG")
    return buf.getvalue()


async def test_convert_upload_pdf_unchanged():
    from papermerge.core.features.document.upload_pdf_convert import (
        convert_upload_to_pdf_payload,
    )

    pdf = _minimal_pdf_bytes()
    data, name, ct = await convert_upload_to_pdf_payload(
        data=pdf,
        file_name="report.pdf",
        content_type="application/pdf",
    )
    assert data == pdf
    assert name == "report.pdf"
    assert ct == "application/pdf"


async def test_convert_upload_png_to_pdf():
    from papermerge.core.features.document.upload_pdf_convert import (
        convert_upload_to_pdf_payload,
    )

    png = _minimal_png_bytes()
    data, name, ct = await convert_upload_to_pdf_payload(
        data=png,
        file_name="photo.png",
        content_type="image/png",
    )
    assert data.startswith(b"%PDF")
    assert name == "photo.png.pdf"
    assert ct == "application/pdf"


async def test_convert_upload_docx_to_pdf(monkeypatch):
    from papermerge.core.features.document import upload_pdf_convert as mod

    docx = _minimal_docx_bytes()
    pdf = _minimal_pdf_bytes()

    async def fake_convert(content: bytes, file_name: str) -> bytes:
        assert content == docx
        assert file_name == "notes.docx"
        return pdf

    monkeypatch.setattr(mod, "convert_docx_to_pdf", fake_convert)

    data, name, ct = await mod.convert_upload_to_pdf_payload(
        data=docx,
        file_name="notes.docx",
        content_type=(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ),
    )
    assert data == pdf
    assert name == "notes.docx.pdf"
    assert ct == "application/pdf"


async def test_convert_upload_other_blob_unchanged():
    from papermerge.core.features.document.upload_pdf_convert import (
        convert_upload_to_pdf_payload,
    )

    payload = b"not-a-convertible-file"
    data, name, ct = await convert_upload_to_pdf_payload(
        data=payload,
        file_name="archive.zip",
        content_type="application/zip",
    )
    assert data == payload
    assert name == "archive.zip"
    assert ct == "application/zip"


async def test_convert_upload_docx_error_propagates(monkeypatch):
    from papermerge.core.features.document import upload_pdf_convert as mod
    from papermerge.core.features.document.docx_convert import DocxConversionError

    async def boom(content: bytes, file_name: str) -> bytes:
        raise DocxConversionError("conversion failed")

    monkeypatch.setattr(mod, "convert_docx_to_pdf", boom)

    with pytest.raises(mod.UploadPdfConversionError, match="conversion failed"):
        await mod.convert_upload_to_pdf_payload(
            data=_minimal_docx_bytes(),
            file_name="bad.docx",
            content_type="application/octet-stream",
        )
