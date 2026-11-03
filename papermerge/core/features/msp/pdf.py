"""Render a measure (МСП) to a PDF file from its filled sections.

Uses PyMuPDF's HTML "Story" engine which bundles a Cyrillic-capable font
(Charis SIL), so Russian text renders correctly without shipping font files.
"""
from __future__ import annotations

import html
import io

import pymupdf as fitz


def _escape(value: str) -> str:
    return html.escape(value or "")


def _body_to_html(body: str) -> str:
    """Convert plain text (newline separated lines) into HTML paragraphs."""
    parts: list[str] = []
    for line in (body or "").splitlines():
        line = line.strip()
        if line:
            parts.append(f"<p>{_escape(line)}</p>")
    return "".join(parts)


def build_msp_html(msp, title: str) -> str:
    """Build the full HTML document for a measure.

    Only non-empty sections are included; empty sections are "not needed".
    """
    parts = [f"<h1>{_escape(title)}</h1>"]
    sections = sorted(msp.sections, key=lambda s: s.sort_order)
    for section in sections:
        body = (section.body or "").strip()
        if not body:
            continue
        parts.append(f"<h2>{_escape(section.title)}</h2>")
        parts.append(_body_to_html(section.body))
    return "".join(parts)


def render_msp_pdf(msp, title: str) -> bytes:
    """Render the measure to PDF bytes (A4, paginated automatically)."""
    html_doc = build_msp_html(msp, title)
    story = fitz.Story(html_doc)
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
