"""Helpers for HTML stored in measure section bodies."""
from __future__ import annotations

import re

from papermerge.core.features.handbook.sanitize import sanitize_html

_TAG_RE = re.compile(r"<[^>]+>", re.DOTALL)
_ENTITY_RE = re.compile(r"&nbsp;|&#160;|&#xA0;", re.IGNORECASE)
_HTML_RE = re.compile(r"</?[a-z][\s\S]*>", re.IGNORECASE)


def looks_like_html(value: str) -> bool:
    return bool(_HTML_RE.search(value or ""))


def plain_text(value: str) -> str:
    text = _ENTITY_RE.sub(" ", value or "")
    text = _TAG_RE.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def is_empty_body(value: str | None) -> bool:
    return not plain_text(value or "")


def sanitize_msp_html(value: str) -> str:
    return sanitize_html(value or "")
