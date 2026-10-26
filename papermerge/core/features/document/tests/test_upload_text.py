import io
import zipfile

import pytest

from papermerge.core.features.document import upload_text as ut


def test_decode_text_bytes_utf8():
    assert ut.decode_text_bytes("привет".encode()) == "привет"


def test_extract_upload_text_plain():
    text = ut.extract_upload_text(
        content=b"hello world",
        file_name="notes.txt",
        content_type="text/plain",
    )
    assert text == "hello world"


def test_extract_upload_text_json_by_mime():
    text = ut.extract_upload_text(
        content=b'{"key": "value"}',
        file_name="data.bin",
        content_type="application/json",
    )
    assert '"key"' in text


def test_extract_upload_text_docx():
    buf = io.BytesIO()
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body><w:p><w:r><w:t>Searchable DOCX body</w:t></w:r></w:p></w:body>"
        "</w:document>"
    )
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("word/document.xml", document_xml)
    text = ut.extract_upload_text(
        content=buf.getvalue(),
        file_name="report.docx",
        content_type=ut.DOCX_CONTENT_TYPE,
    )
    assert text == "Searchable DOCX body"


def test_extract_upload_text_unsupported_binary():
    assert (
        ut.extract_upload_text(
            content=b"\x00\x01\x02",
            file_name="archive.zip",
            content_type="application/zip",
        )
        is None
    )


def test_should_extract_upload_text_yml_extension():
    assert ut.should_extract_upload_text(
        file_name="docker-compose.yml",
        content_type="application/octet-stream",
    )
