"""Classify normative-act titles into registry type-folder names.

Used by the one-shot NPA reorg (physical folders under
Федеральные/Региональные) and by measure virtual-folder rebinding.
"""

from __future__ import annotations

import re

_EXT_RE = re.compile(r"\.(pdf|docx?|odt|rtf)$", re.IGNORECASE)
_WS_RE = re.compile(r"\s+")

# Virtual folder title: "Федеральные — Федеральные законы"
VIRTUAL_SEP = " — "

# Preferred type folder titles per bucket (created only when needed).
FEDERAL_TYPES: tuple[str, ...] = (
    "Федеральные законы",
    "Постановления Правительства",
    "Распоряжения",
    "Приказы Министерств",
    "Указы",
    "Письма",
    "Иные",
)
REGIONAL_TYPES: tuple[str, ...] = (
    "Законы Хабаровского края",
    "Постановления Губернатора",
    "Постановления Правительства",
    "Приказы Министерств",
    "Распоряжения",
    "Письма",
    "Иные",
)


def strip_ext(title: str) -> str:
    return _EXT_RE.sub("", title or "")


def normalize_ws(title: str) -> str:
    return _WS_RE.sub(" ", (title or "").strip())


def classify_type(title: str, *, bucket: str) -> str:
    """Return the canonical type-folder title for ``title`` under ``bucket``.

    ``bucket`` is ``Федеральные`` or ``Региональные``.
    """
    t = strip_ext(title).casefold()
    t = normalize_ws(t)

    if bucket.startswith("Федер"):
        if (
            "федеральн" in t
            or re.search(r"\d\s*-?\s*фз\b", t)
            or " фз" in t
            or t.endswith("фз")
        ):
            if "закон" in t or "фз" in t:
                return "Федеральные законы"
        if "указ" in t:
            return "Указы"
        if "постановлен" in t:
            return "Постановления Правительства"
        if "распоряжен" in t:
            return "Распоряжения"
        if "приказ" in t:
            return "Приказы Министерств"
        if "письм" in t:
            return "Письма"
        if "закон" in t:
            return "Федеральные законы"
        return "Иные"

    # Regional (Хабаровский край taxonomy already on prod)
    if "постановлен" in t and "правительств" in t:
        return "Постановления Правительства"
    if "постановлен" in t and "губернатор" in t:
        return "Постановления Губернатора"
    if "постановлен" in t:
        # "-пр" / "пр." style numbers are normally Правительства ХК
        if re.search(r"\b\d+\s*-?\s*пр\b", t) or "-пр" in t:
            return "Постановления Правительства"
        return "Постановления Губернатора"
    if "закон" in t:
        return "Законы Хабаровского края"
    if "приказ" in t:
        return "Приказы Министерств"
    if "распоряжен" in t:
        return "Распоряжения"
    if "письм" in t:
        return "Письма"
    if "указ" in t:
        return "Указы"
    return "Иные"


def match_existing_type(preferred: str, existing_titles: list[str]) -> str | None:
    """If an existing folder already covers ``preferred``, return its title."""
    pref = preferred.casefold()
    for title in existing_titles:
        if title.casefold() == pref:
            return title
    # Soft match: "Законы Хабаровского края" vs preferred "Законы ..."
    for title in existing_titles:
        tc = title.casefold()
        if pref.startswith("закон") and tc.startswith("закон"):
            return title
        if pref.startswith("приказ") and "приказ" in tc:
            return title
        if pref.startswith("распоряжен") and "распоряжен" in tc:
            return title
        if pref.startswith("указ") and "указ" in tc:
            return title
        if pref.startswith("письм") and "письм" in tc:
            return title
        if pref == "постановления правительства" and (
            "постановлен" in tc and "правительств" in tc
        ):
            return title
        if pref == "постановления губернатора" and (
            "постановлен" in tc and "губернатор" in tc
        ):
            return title
        if pref.startswith("федеральн") and (
            "федеральн" in tc or (tc.startswith("закон") and "федеральн" in pref)
        ):
            return title
    return None


def virtual_folder_title(bucket: str, type_title: str) -> str:
    return f"{bucket}{VIRTUAL_SEP}{type_title}"


def parse_virtual_folder_title(title: str) -> tuple[str | None, str | None]:
    """Split ``Федеральные — Приказы Министерств`` → (bucket, type)."""
    if VIRTUAL_SEP in (title or ""):
        bucket, typ = title.split(VIRTUAL_SEP, 1)
        return bucket.strip() or None, typ.strip() or None
    # Legacy flat titles
    if title in ("Федеральные", "Региональные"):
        return title, None
    return None, None
