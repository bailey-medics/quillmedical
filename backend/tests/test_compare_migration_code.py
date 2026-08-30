"""Tests for the migration code/prose comparer.

The rule under test: a merged migration's code is frozen, its comments are
not - except the allow-destructive marker, which is a comment that records a
decision and so is frozen with the code.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from scripts.compare_migration_code import (
    EXIT_CODE_CHANGED,
    EXIT_OK,
    EXIT_USAGE,
    describe_difference,
    main,
    marker_vector,
)

BASE = '''"""Drop the superseded column."""

revision = "0001"
down_revision = None


def upgrade() -> None:
    # migration-check: allow-destructive
    # Superseded by the audit table.
    op.drop_column("users", "old")


def downgrade() -> None:
    op.add_column("users", sa.Column("old", sa.String()))
'''


def _edit(old: str, new: str, source: str = BASE) -> str:
    assert old in source, f"fixture does not contain {old!r}"
    return source.replace(old, new)


def test_identical_sources_are_unchanged() -> None:
    assert describe_difference(BASE, BASE) is None


def test_rewording_a_rationale_is_allowed() -> None:
    after = _edit(
        "# Superseded by the audit table.",
        "# Superseded by the audit table in migration 0002.",
    )

    assert describe_difference(BASE, after) is None


def test_adding_an_unrelated_comment_is_allowed() -> None:
    after = _edit(
        "def downgrade() -> None:",
        "# Reversible: the column was never populated.\ndef downgrade() -> None:",
    )

    assert describe_difference(BASE, after) is None


def test_comment_edits_shift_line_numbers_without_tripping_the_check() -> None:
    """A comment inserted high up moves every statement below it.

    ast.dump omits line numbers by default, which is what makes this work -
    worth pinning, since a future switch to include_attributes=True would
    silently turn every comment edit into a failure.
    """
    after = _edit('revision = "0001"', '# Added later.\nrevision = "0001"')

    assert describe_difference(BASE, after) is None


def test_changing_the_ddl_is_rejected() -> None:
    after = _edit(
        'op.drop_column("users", "old")', 'op.drop_column("users", "other")'
    )

    difference = describe_difference(BASE, after)

    assert difference is not None
    assert "its code changed" in difference


def test_changing_the_docstring_is_rejected() -> None:
    """The docstring is the migration's description, validated elsewhere."""
    after = _edit(
        '"""Drop the superseded column."""',
        '"""Drop a column."""',
    )

    difference = describe_difference(BASE, after)

    assert difference is not None
    assert "its code changed" in difference


def test_changing_the_revision_identifier_is_rejected() -> None:
    after = _edit('revision = "0001"', 'revision = "0009"')

    difference = describe_difference(BASE, after)

    assert difference is not None
    assert "its code changed" in difference


def test_removing_the_marker_is_rejected() -> None:
    after = _edit("    # migration-check: allow-destructive\n", "")

    difference = describe_difference(BASE, after)

    assert difference is not None
    assert "marker was added or removed" in difference


def test_shortening_the_marker_is_rejected() -> None:
    """Matching is by literal substring, so dropping the prefix breaks it."""
    after = _edit(
        "# migration-check: allow-destructive",
        "# allow-destructive",
    )

    difference = describe_difference(BASE, after)

    assert difference is not None
    assert "marker was added or removed" in difference


def test_a_blank_line_between_marker_and_call_is_not_a_detachment() -> None:
    """Reformatting must not silently uncover an approved operation."""
    after = _edit("    # Superseded by the audit table.\n", "\n")

    assert describe_difference(BASE, after) is None


def test_unparseable_source_is_reported_rather_than_crashing() -> None:
    difference = describe_difference(BASE, "def upgrade(:\n")

    assert difference is not None
    assert "does not parse as Python" in difference


def test_marker_vector_has_one_entry_per_destructive_call() -> None:
    two_drops = _edit(
        '    op.drop_column("users", "old")',
        '    op.drop_column("users", "old")\n    op.drop_table("legacy")',
    )

    # The second drop has no marker directly above it.
    assert marker_vector(two_drops) == [True, False]


def test_marker_vector_ignores_non_destructive_calls() -> None:
    assert (
        marker_vector('def upgrade() -> None:\n    op.add_column("u", c)\n')
        == []
    )


def test_main_returns_ok_for_a_comment_only_edit(tmp_path: Path) -> None:
    before = tmp_path / "before.py"
    after = tmp_path / "after.py"
    before.write_text(BASE)
    after.write_text(
        _edit("# Superseded by the audit table.", "# Superseded.")
    )

    assert main([str(before), str(after)]) == EXIT_OK


def test_main_returns_changed_for_a_code_edit(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    before = tmp_path / "before.py"
    after = tmp_path / "after.py"
    before.write_text(BASE)
    after.write_text(_edit('"old"', '"other"'))

    assert main([str(before), str(after)]) == EXIT_CODE_CHANGED
    assert "its code changed" in capsys.readouterr().err


@pytest.mark.parametrize("args", [[], ["one"], ["one", "two", "three"]])
def test_main_rejects_the_wrong_number_of_arguments(args: list[str]) -> None:
    assert main(args) == EXIT_USAGE


def test_main_rejects_a_missing_file(tmp_path: Path) -> None:
    existing = tmp_path / "before.py"
    existing.write_text(BASE)

    assert main([str(existing), str(tmp_path / "gone.py")]) == EXIT_USAGE
