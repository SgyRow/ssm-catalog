import re

_BLOCK_RE = re.compile(
    r"<(script|style|iframe|object|embed|link)(\s[^>]*)?>[\s\S]*?</\1>",
    re.IGNORECASE,
)
_SELF_RE = re.compile(
    r"<(script|style|iframe|object|embed|link)(\s[^>]*)?/?>",
    re.IGNORECASE,
)
_EVENT_RE = re.compile(r"\son\w+\s*=", re.IGNORECASE)
_JS_RE = re.compile(r"javascript:", re.IGNORECASE)


def sanitize_html(html: str) -> str:
    cleaned = _BLOCK_RE.sub("", html or "")
    cleaned = _SELF_RE.sub("", cleaned)
    cleaned = _EVENT_RE.sub(" ", cleaned)
    return _JS_RE.sub("", cleaned)
