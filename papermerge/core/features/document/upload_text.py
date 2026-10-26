"""Extract plain text from uploaded blob files for search indexing."""

from __future__ import annotations

import io
import logging
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree

from papermerge.core.utils.image import TEXT_SNIPPET_EXTENSIONS

logger = logging.getLogger(__name__)

# Keep Solr/DB payloads bounded for very large uploads.
MAX_EXTRACTED_TEXT_CHARS = 500_000

DOCX_EXTENSION = ".docx"
HTML_EXTENSIONS = frozenset({".html", ".htm"})
DOCX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)

TEXT_CONTENT_TYPE_PREFIXES = ("text/",)
TEXT_CONTENT_TYPES = frozenset(
    {
        "application/json",
        "application/xml",
        "application/yaml",
        "application/x-yaml",
        "application/javascript",
        "application/ecmascript",
        "application/sql",
        DOCX_CONTENT_TYPE,
    }
)

_W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


class _HTMLTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._parts: list[str] = []

    def handle_data(self, data: str) -> None:
        if data:
            self._parts.append(data)

    def text(self) -> str:
        return " ".join(self._parts)


def should_extract_upload_text(*, file_name: str, content_type: str) -> bool:
    ext = Path(file_name or "").suffix.lower()
    if ext in {DOCX_EXTENSION, *HTML_EXTENSIONS, *TEXT_SNIPPET_EXTENSIONS}:
        return True
    ct = (content_type or "").split(";")[0].strip().lower()
    if not ct:
        return False
    if ct.startswith(TEXT_CONTENT_TYPE_PREFIXES):
        return True
    return ct in TEXT_CONTENT_TYPES


def decode_text_bytes(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1251", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def extract_html_text(raw: bytes) -> str:
    parser = _HTMLTextExtractor()
    parser.feed(decode_text_bytes(raw))
    return parser.text()


def extract_docx_text(raw: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        with zf.open("word/document.xml") as xml_file:
            tree = ElementTree.parse(xml_file)
    parts: list[str] = []
    for node in tree.iter(f"{_W_NS}t"):
        if node.text:
            parts.append(node.text)
        if node.tail:
            parts.append(node.tail)
    return "".join(parts)


def _truncate(text: str) -> str:
    text = text.strip()
    if len(text) <= MAX_EXTRACTED_TEXT_CHARS:
        return text
    return text[:MAX_EXTRACTED_TEXT_CHARS]


def extract_upload_text(
    *,
    content: bytes,
    file_name: str,
    content_type: str | None,
) -> str | None:
    """Return plain text for search indexing, or None if unsupported/empty."""
    ct = (content_type or "").split(";")[0].strip().lower()
    if not should_extract_upload_text(file_name=file_name, content_type=ct):
        return None

    ext = Path(file_name or "").suffix.lower()
    try:
        if ext == DOCX_EXTENSION or ct == DOCX_CONTENT_TYPE:
            text = extract_docx_text(content)
        elif ext in HTML_EXTENSIONS or ct in {"text/html", "application/xhtml+xml"}:
            text = extract_html_text(content)
        else:
            text = decode_text_bytes(content)
    except Exception:
        logger.exception("Failed to extract text from upload %r", file_name)
        return None

    text = _truncate(text)
    return text or None


def extract_text_from_file(
    *,
    file_path: Path,
    file_name: str,
    content_type: str | None,
) -> str | None:
    """Read a stored blob file from disk and extract searchable text."""
    if not file_path.is_file():
        return None
    try:
        raw = file_path.read_bytes()
    except OSError:
        logger.exception("Failed to read file for text extraction: %s", file_path)
        return None
    return extract_upload_text(content=raw, file_name=file_name, content_type=content_type)
