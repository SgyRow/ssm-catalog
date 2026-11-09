from papermerge.core.features.msp.htmlutil import (
    is_empty_body,
    looks_like_html,
    sanitize_msp_html,
)
from papermerge.core.features.msp.pdf import _body_to_html


def test_empty_html_is_skipped():
    assert is_empty_body("")
    assert is_empty_body("   ")
    assert is_empty_body("<p></p>")
    assert is_empty_body("<p><br></p>")
    assert is_empty_body("<p>&nbsp;</p>")
    assert not is_empty_body("<p>Текст</p>")
    assert not is_empty_body("Нужен паспорт.")


def test_sanitize_strips_script():
    cleaned = sanitize_msp_html(
        '<p>ok</p><script>alert(1)</script><table><tr><td onclick="x">a</td></tr></table>'
    )
    assert "<script" not in cleaned.lower()
    assert "onclick" not in cleaned.lower()
    assert "ok" in cleaned
    assert "<table>" in cleaned


def test_pdf_keeps_tables():
    html = _body_to_html("<table><tr><td>ячейка</td></tr></table>")
    assert "<table>" in html
    assert "ячейка" in html
    assert looks_like_html(html)


def test_pdf_plain_text_still_escaped():
    html = _body_to_html("строка <3")
    assert "&lt;3" in html
    assert "<p>" in html
