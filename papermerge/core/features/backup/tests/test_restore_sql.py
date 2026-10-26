from papermerge.core.features.backup.service import (
    _is_unsupported_restore_guc,
    _replace_tree_contents,
)


def test_pg17_transaction_timeout_is_stripped():
    assert _is_unsupported_restore_guc(b"SET transaction_timeout = 0;\n")
    assert _is_unsupported_restore_guc(b"  SET transaction_timeout = 0;\n")


def test_postgres16_session_settings_are_kept():
    assert not _is_unsupported_restore_guc(b"SET statement_timeout = 0;\n")
    assert not _is_unsupported_restore_guc(b"SET lock_timeout = 0;\n")
    assert not _is_unsupported_restore_guc(
        b"SET idle_in_transaction_session_timeout = 0;\n"
    )
    assert not _is_unsupported_restore_guc(b"COPY public.nodes (title) FROM stdin;\n")


def test_replace_tree_keeps_the_directory_itself(tmp_path):
    destination = tmp_path / "pmg"
    destination.mkdir()
    (destination / "old.txt").write_text("old", encoding="utf-8")
    nested = destination / "kept-dir"
    nested.mkdir()
    (nested / "a.txt").write_text("a", encoding="utf-8")
    inode = destination.stat().st_ino

    source = tmp_path / "staged"
    (source / "new.txt").parent.mkdir()
    (source / "new.txt").write_text("new", encoding="utf-8")
    (source / "sub").mkdir()
    (source / "sub" / "b.txt").write_text("b", encoding="utf-8")

    _replace_tree_contents(source, destination)

    assert destination.stat().st_ino == inode
    assert not (destination / "old.txt").exists()
    assert not nested.exists()
    assert (destination / "new.txt").read_text(encoding="utf-8") == "new"
    assert (destination / "sub" / "b.txt").read_text(encoding="utf-8") == "b"
    assert not (destination / ".restore-incoming").exists()


def test_replace_tree_clears_destination_when_source_is_empty(tmp_path):
    destination = tmp_path / "pmg"
    destination.mkdir()
    (destination / "old.txt").write_text("old", encoding="utf-8")
    source = tmp_path / "staged"
    source.mkdir()

    _replace_tree_contents(source, destination)

    assert list(destination.iterdir()) == []
