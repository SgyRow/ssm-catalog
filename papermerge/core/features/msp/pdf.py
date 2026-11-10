"""Render a measure (МСП) to a PDF file from its filled sections.

Uses PyMuPDF's HTML "Story" engine which bundles a Cyrillic-capable font
(Charis SIL), so Russian text renders correctly without shipping font files.
"""
from __future__ import annotations

import html
import io

import pymupdf as fitz

from papermerge.core.features.msp.htmlutil import (
    is_empty_body,
    looks_like_html,
    sanitize_msp_html,
)

_USER_CSS = """
h1 { font-size: 18pt; }
h2 { font-size: 13pt; margin-top: 12pt; }
p { margin: 0 0 6pt 0; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #444; padding: 4pt; vertical-align: top; }
img { max-width: 100%; }
"""


def _escape(value: str) -> str:
    return html.escape(value or "")


def _body_to_html(body: str) -> str:
    """Turn a stored section body into HTML fragments for the PDF story."""
    raw = body or ""
    if looks_like_html(raw):
        return sanitize_msp_html(raw)
    parts: list[str] = []
    for line in raw.splitlines():
        line = line.strip()
        if line:
            parts.append(f"<p>{_escape(line)}</p>")
    return "".join(parts)


def build_msp_html(msp, title: str) -> str:
    """Build the full HTML document for a measure.

    Only non-empty, visible sections are included: empty sections are
    "not needed", hidden sections are excluded on purpose (for this measure
    only — their text is still stored in the database).
    """
    parts = [f"<h1>{_escape(title)}</h1>"]
    sections = sorted(msp.sections, key=lambda s: s.sort_order)
    for section in sections:
        if section.hidden or is_empty_body(section.body or ""):
            continue
        parts.append(f"<h2>{_escape(section.title)}</h2>")
        parts.append(_body_to_html(section.body or ""))
    return "".join(parts)


def render_msp_pdf(msp, title: str) -> bytes:
    """Render the measure to PDF bytes (A4, paginated automatically)."""
    html_doc = build_msp_html(msp, title)
    story = fitz.Story(html_doc, user_css=_USER_CSS)
    buf = io.BytesIO()
    a4 = fitz.paper_rect("a4")

    def rectfn(rect_num: int, filled):  # noqa: ARG001
        margin = 40
        return (
            a4,
            fitz.Rect(margin, margin, a4.width - margin, a4.height - margin),
            fitz.Matrix(1, 1),
        )

    with fitz.DocumentWriter(buf) as writer:
        story.write(writer, rectfn)
    return buf.getvalue()


def pdf_file_name(title: str) -> str:
    """A safe, human readable file name for the generated PDF."""
    safe = "".join(
        c if c.isalnum() or c in " -_" else "" for c in (title or "").strip()
    ).strip()
    safe = " ".join(safe.split())
    if not safe:
        safe = "msp"
    return f"{safe}.pdf"
