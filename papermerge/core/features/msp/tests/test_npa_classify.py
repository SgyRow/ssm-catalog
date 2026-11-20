from papermerge.core.features.msp.npa_classify import (
    classify_type,
    parse_virtual_folder_title,
    virtual_folder_title,
)


def test_regional_pravitelstvo_vs_gubernator():
    assert (
        classify_type(
            "Постановление Правительства Хабаровского края от 03.06.2025 № 247-пр.pdf",
            bucket="Региональные",
        )
        == "Постановления Правительства"
    )
    assert (
        classify_type(
            "Постановление Губернатора Хабаровского края от 12 февраля 2025 года № 8.pdf",
            bucket="Региональные",
        )
        == "Постановления Губернатора"
    )


def test_regional_law_and_order():
    assert (
        classify_type(
            "Закон Хабаровского края от 26.01.2005 № 254.pdf",
            bucket="Региональные",
        )
        == "Законы Хабаровского края"
    )
    assert (
        classify_type("Приказ министерства от 01.01.2020.pdf", bucket="Региональные")
        == "Приказы Министерств"
    )


def test_federal_fz():
    assert (
        classify_type(
            "Федеральный закон от 10.01.2002 № 2-ФЗ.pdf",
            bucket="Федеральные",
        )
        == "Федеральные законы"
    )
    assert (
        classify_type(
            "Постановление Правительства РФ от 20.02.2003 № 512.pdf",
            bucket="Федеральные",
        )
        == "Постановления Правительства"
    )


def test_virtual_title_roundtrip():
    title = virtual_folder_title("Региональные", "Постановления Правительства")
    assert title == "Региональные — Постановления Правительства"
    assert parse_virtual_folder_title(title) == (
        "Региональные",
        "Постановления Правительства",
    )
