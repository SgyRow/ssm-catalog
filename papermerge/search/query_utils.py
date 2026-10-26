import re

_SOLR_SPECIAL_RE = re.compile(r'([+\-&|!(){}[\]^"~*?:\\/])')


def prepare_user_query(query: str) -> str:
    """Turn free-text user input into a Solr query with partial token matching."""
    if not query or not query.strip():
        return query

    parts: list[str] = []
    for raw_token in query.split():
        if ":" in raw_token:
            field, _, value = raw_token.partition(":")
            escaped_value = _SOLR_SPECIAL_RE.sub(r"\\\1", value)
            if escaped_value and not escaped_value.endswith("*"):
                escaped_value = _wildcard_term(escaped_value)
            parts.append(f"{field}:{escaped_value}")
            continue

        escaped = _SOLR_SPECIAL_RE.sub(r"\\\1", raw_token)
        if escaped:
            parts.append(_wildcard_term(escaped))

    return " ".join(parts)


def _wildcard_term(token: str) -> str:
    if token.endswith("*"):
        return token
    # Short tokens (e.g. "yml", "pdf") are often file extensions or suffixes
    # stored inside a larger Solr token ("compose.yml"); use infix matching.
    if len(token) <= 3:
        return f"*{token}*"
    # Solr may split identifiers on _ or - (e.g. POSTGRES_DB, docker-compose).
    if "_" in token or "-" in token:
        return f"*{token}*"
    return f"{token}*"
