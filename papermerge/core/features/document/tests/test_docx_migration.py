from papermerge.core.features.document.docx_convert import (
    is_legacy_docx_version,
    pdf_companion_name,
)


def test_is_legacy_docx_version():
    assert is_legacy_docx_version("report.docx") is True
    assert is_legacy_docx_version("Report.DOCX") is True
    assert is_legacy_docx_version("report.docx.pdf") is False
    assert is_legacy_docx_version("report.pdf") is False
    assert is_legacy_docx_version(None) is False


def test_pdf_companion_name():
    assert pdf_companion_name("report.docx") == "report.docx.pdf"
