import uuid
from pathlib import Path

from papermerge.core.types import ImagePreviewSize
from papermerge.core import constants as const
from papermerge.core import pathlib as plib


def test_thumbnail_path_1():
    uid = uuid.uuid4()
    str_uuid = str(uid)
    actual = plib.thumbnail_path(uid)

    expected = Path(
        const.THUMBNAILS,
        const.JPG,
        str_uuid[0:2],
        str_uuid[2:4],
        str_uuid,
        f"{ImagePreviewSize.sm.value}.{const.JPG}",
    )

    assert actual == expected


def test_docver_storage_basename_shortens_long_titles():
    long_name = (
        'Постановление Правительства Хабаровского края от 30.10.2015 № 358-пр '
        '(ред. от 09.12.2025) "Об утверждении порядка назначения и выплаты '
        "ежемесячной денежной выплаты отдельным категориям граждан на "
        'территории Хабаровского края".docx'
    )
    assert plib.docver_storage_basename(long_name) == "original.docx"
    assert plib.docver_storage_basename(
        long_name.replace('"', "%22")
    ) == "original.docx"


def test_docver_path_uses_storage_basename():
    uid = uuid.uuid4()
    long_name = "a" * 300 + ".pdf"
    actual = plib.docver_path(uid, long_name)
    assert actual.name == "original.pdf"


def test_abs_docver_path_falls_back_to_legacy_long_name(tmp_path, monkeypatch):
    uid = uuid.uuid4()
    long_name = "x" * 250 + ".docx"
    monkeypatch.setattr(
        plib.config,
        "papermerge__main__media_root",
        tmp_path,
    )
    legacy = tmp_path / plib._docver_rel_path(uid, long_name, use_storage_basename=False)
    legacy.parent.mkdir(parents=True)
    legacy.write_bytes(b"legacy")

    resolved = plib.abs_docver_path(uid, long_name)
    assert resolved == legacy
    assert resolved.read_bytes() == b"legacy"


def test_page_preview_jpg_path():
    uid = uuid.uuid4()
    str_uuid = str(uid)

    actual = plib.page_preview_jpg_path(uid, ImagePreviewSize.md)
    expected = Path(
        const.PREVIEWS,
        const.PAGES,
        str_uuid[0:2],
        str_uuid[2:4],
        str_uuid,
        f"{ImagePreviewSize.md.value}.{const.JPG}",
    )

    assert actual == expected
