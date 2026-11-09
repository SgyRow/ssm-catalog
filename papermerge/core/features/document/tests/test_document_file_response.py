from pathlib import Path
from urllib.parse import quote, unquote

from papermerge.core.features.document.response import (
    DocumentFileResponse,
    content_disposition_header,
)


def test_content_disposition_strips_comma_that_breaks_chrome():
    filename = "Письмо, исх. № 106.pdf"
    header = content_disposition_header("inline", filename)

    assert header.count("Content-Disposition") == 0
    assert "," not in header
    assert header.startswith("inline;")
    assert "filename*=UTF-8''" in header
    encoded = header.split("filename*=UTF-8''", 1)[1]
    assert unquote(encoded) == filename
    assert quote(filename, safe="") == encoded


def test_content_disposition_ascii_name_without_quotes_or_semicolons():
    header = content_disposition_header("attachment", 'report; "final", v2.pdf')
    assert "," not in header
    assert ";" not in header.split("filename=", 1)[1].split("filename*", 1)[0].strip(" \";")
    assert '"' not in header.split('filename="', 1)[1].split('"', 1)[0]


def test_document_file_response_emits_single_content_disposition(tmp_path: Path):
    path = tmp_path / "file.pdf"
    path.write_bytes(b"%PDF-1.4")
    response = DocumentFileResponse(
        path,
        filename="Письмо, исх. № 106.pdf",
        content_disposition_type="inline",
    )
    values = [
        value.decode("latin-1")
        for key, value in response.raw_headers
        if key.lower() == b"content-disposition"
    ]
    assert len(values) == 1
    assert "," not in values[0]
    assert values[0].startswith("inline;")
