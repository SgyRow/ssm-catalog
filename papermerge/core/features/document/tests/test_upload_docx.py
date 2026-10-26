import io
import zipfile

import pytest
from pikepdf import Pdf


def _minimal_docx_bytes() -> bytes:
    buf = io.BytesIO()
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body><w:p><w:r><w:t>Upload DOCX body</w:t></w:r></w:p></w:body>"
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


@pytest.mark.parametrize(
    ("file_name", "content_type", "expected"),
    [
        ("report.docx", "application/octet-stream", True),
        (
            "report.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            True,
        ),
        ("report.pdf", "application/pdf", False),
        ("report.doc", "application/msword", False),
    ],
)
def test_is_docx_upload(file_name, content_type, expected):
    from papermerge.core.features.document.docx_convert import is_docx_upload

    assert is_docx_upload(content_type=content_type, file_name=file_name) is expected


async def test_document_upload_docx(make_document, user, db_session, monkeypatch):
    """
    DOCX upload stores the original Word file and a derived PDF version.
    Preview uses the latest (PDF) version; download lists both.
    """
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from papermerge.core.features.document.db import api as dbapi
    from papermerge.core.features.document.db import orm as docs_orm

    doc = await make_document(title="some doc", user=user, parent=user.home_folder)
    docx_bytes = _minimal_docx_bytes()
    pdf_bytes = _minimal_pdf_bytes()

    async def fake_convert(content: bytes, file_name: str) -> bytes:
        assert content == docx_bytes
        assert file_name == "report.docx"
        return pdf_bytes

    monkeypatch.setattr(dbapi, "convert_docx_to_pdf", fake_convert)

    fresh_doc, error = await dbapi.upload(
        db_session,
        document_id=doc.id,
        content=io.BytesIO(docx_bytes),
        file_name="report.docx",
        size=len(docx_bytes),
        content_type=(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ),
    )

    assert error is None, error
    assert fresh_doc is not None

    stmt = (
        select(docs_orm.Document)
        .options(selectinload(docs_orm.Document.versions))
        .where(docs_orm.Document.id == doc.id)
    )
    stored = (await db_session.execute(stmt)).scalar()

    assert len(stored.versions) == 2
    assert stored.versions[0].file_name == "report.docx"
    assert stored.versions[0].size == len(docx_bytes)
    assert stored.versions[0].file_path.exists()
    assert stored.versions[0].text == "Upload DOCX body"

    assert stored.versions[1].file_name == "report.docx.pdf"
    assert stored.versions[1].file_path.exists()
    assert stored.versions[1].page_count == 1

    last_ver = await dbapi.get_last_doc_ver(db_session, doc_id=doc.id)
    assert last_ver.file_name == "report.docx.pdf"
