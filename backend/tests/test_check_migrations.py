"""Tests for the Alembic migration safety checker.

Covers each static check with a passing and a failing fixture, plus the
allow-list behaviour that grandfathers the current history.
"""

from __future__ import annotations

from pathlib import Path

from scripts.check_migrations import (
    DEFAULT_VERSIONS_DIR,
    SEVERITY_ERROR,
    Migration,
    check_chain_integrity,
    check_description,
    check_destructive,
    check_not_null_trap,
    check_reversibility,
    collect_migrations,
    main,
)


def _migration_source(
    revision: str,
    down_revision: str | None,
    *,
    description: str = "do a thing",
    upgrade_body: str = "    pass",
    downgrade_body: str = "    op.drop_table('thing')",
    annotated: bool = True,
) -> str:
    down = "None" if down_revision is None else f'"{down_revision}"'
    docstring = (
        f'"""{description}\n\n'
        f"Revision ID: {revision}\n"
        f'Revises: {down_revision or ""}\n'
        f"Create Date: 2026-01-01 00:00:00\n\n"
        f'"""'
    )
    if annotated:
        rev_line = f'revision: str = "{revision}"'
        down_line = f"down_revision: Union[str, None] = {down}"
    else:
        rev_line = f'revision = "{revision}"'
        down_line = f"down_revision = {down}"
    return (
        f"{docstring}\n\n"
        "from typing import Sequence, Union\n\n"
        "from alembic import op\n"
        "import sqlalchemy as sa\n\n"
        f"{rev_line}\n"
        f"{down_line}\n"
        "branch_labels = None\n"
        "depends_on = None\n\n\n"
        "def upgrade() -> None:\n"
        f"{upgrade_body}\n\n\n"
        "def downgrade() -> None:\n"
        f"{downgrade_body}\n"
    )


def _write(tmp_path: Path, name: str, **kwargs: object) -> None:
    (tmp_path / name).write_text(_migration_source(**kwargs))  # type: ignore[arg-type]


def _one(tmp_path: Path, **kwargs: object) -> Migration:
    _write(tmp_path, "rev.py", **kwargs)
    return collect_migrations(tmp_path)[0]


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------


def test_parses_annotated_revision(tmp_path: Path) -> None:
    migration = _one(tmp_path, revision="abc123", down_revision=None)
    assert migration.revision == "abc123"
    assert migration.down_revision is None


def test_parses_plain_revision(tmp_path: Path) -> None:
    migration = _one(
        tmp_path,
        revision="aa11bb22",
        down_revision="cc33dd44",
        annotated=False,
    )
    assert migration.revision == "aa11bb22"
    assert migration.down_revision == "cc33dd44"


# ---------------------------------------------------------------------------
# Chain integrity
# ---------------------------------------------------------------------------


def test_chain_integrity_passes_for_linear_chain(tmp_path: Path) -> None:
    _write(tmp_path, "a.py", revision="a", down_revision=None)
    _write(tmp_path, "b.py", revision="b", down_revision="a")
    _write(tmp_path, "c.py", revision="c", down_revision="b")
    assert check_chain_integrity(collect_migrations(tmp_path)) == []


def test_chain_integrity_rejects_two_bases(tmp_path: Path) -> None:
    _write(tmp_path, "a.py", revision="a", down_revision=None)
    _write(tmp_path, "b.py", revision="b", down_revision=None)
    problems = check_chain_integrity(collect_migrations(tmp_path))
    assert any("multiple base" in p.message for p in problems)


def test_chain_integrity_rejects_branch(tmp_path: Path) -> None:
    _write(tmp_path, "a.py", revision="a", down_revision=None)
    _write(tmp_path, "b.py", revision="b", down_revision="a")
    _write(tmp_path, "c.py", revision="c", down_revision="a")
    problems = check_chain_integrity(collect_migrations(tmp_path))
    assert any("multiple children" in p.message for p in problems)


def test_chain_integrity_rejects_unknown_parent(tmp_path: Path) -> None:
    _write(tmp_path, "a.py", revision="a", down_revision=None)
    _write(tmp_path, "b.py", revision="b", down_revision="missing")
    problems = check_chain_integrity(collect_migrations(tmp_path))
    assert any("matches no known revision" in p.message for p in problems)


def test_chain_integrity_rejects_cycle(tmp_path: Path) -> None:
    _write(tmp_path, "a.py", revision="a", down_revision="b")
    _write(tmp_path, "b.py", revision="b", down_revision="a")
    problems = check_chain_integrity(collect_migrations(tmp_path))
    assert any("cycle" in p.message for p in problems)


# ---------------------------------------------------------------------------
# Non-empty description
# ---------------------------------------------------------------------------


def test_description_passes_with_summary(tmp_path: Path) -> None:
    migration = _one(
        tmp_path, revision="x", down_revision=None, description="add a column"
    )
    assert check_description(migration) == []


def test_description_fails_when_blank(tmp_path: Path) -> None:
    migration = _one(
        tmp_path, revision="x", down_revision=None, description=""
    )
    problems = check_description(migration)
    assert len(problems) == 1
    assert problems[0].severity == SEVERITY_ERROR


# ---------------------------------------------------------------------------
# Reversibility
# ---------------------------------------------------------------------------


def test_reversibility_passes_with_real_downgrade(tmp_path: Path) -> None:
    migration = _one(
        tmp_path,
        revision="x",
        down_revision=None,
        downgrade_body="    op.drop_column('users', 'x')",
    )
    assert check_reversibility(migration) == []


def test_reversibility_fails_on_empty_downgrade(tmp_path: Path) -> None:
    migration = _one(
        tmp_path,
        revision="x",
        down_revision=None,
        downgrade_body="    pass",
    )
    problems = check_reversibility(migration)
    assert len(problems) == 1
    assert problems[0].severity == SEVERITY_ERROR


# ---------------------------------------------------------------------------
# NOT NULL trap
# ---------------------------------------------------------------------------


def test_not_null_passes_with_server_default(tmp_path: Path) -> None:
    body = (
        "    op.add_column(\n"
        "        'users',\n"
        "        sa.Column('flag', sa.Boolean(), server_default='false', "
        "nullable=False),\n"
        "    )"
    )
    migration = _one(
        tmp_path, revision="x", down_revision=None, upgrade_body=body
    )
    assert check_not_null_trap(migration) == []


def test_not_null_fails_on_add_column_without_default(
    tmp_path: Path,
) -> None:
    body = (
        "    op.add_column(\n"
        "        'users',\n"
        "        sa.Column('flag', sa.Boolean(), nullable=False),\n"
        "    )"
    )
    migration = _one(
        tmp_path, revision="x", down_revision=None, upgrade_body=body
    )
    problems = check_not_null_trap(migration)
    assert len(problems) == 1
    assert problems[0].severity == SEVERITY_ERROR


def test_not_null_fails_on_alter_column_without_default(
    tmp_path: Path,
) -> None:
    body = "    op.alter_column('users', 'flag', nullable=False)"
    migration = _one(
        tmp_path, revision="x", down_revision=None, upgrade_body=body
    )
    problems = check_not_null_trap(migration)
    assert any("alter_column" in p.message for p in problems)


# ---------------------------------------------------------------------------
# Destructive operations
# ---------------------------------------------------------------------------


def test_destructive_passes_with_marker(tmp_path: Path) -> None:
    body = (
        "    op.drop_column('users', 'flag')"
        "  # migration-check: allow-destructive"
    )
    migration = _one(
        tmp_path, revision="x", down_revision=None, upgrade_body=body
    )
    assert check_destructive(migration) == []


def test_destructive_fails_without_marker(tmp_path: Path) -> None:
    body = "    op.drop_table('legacy')"
    migration = _one(
        tmp_path, revision="x", down_revision=None, upgrade_body=body
    )
    problems = check_destructive(migration)
    assert len(problems) == 1
    assert problems[0].severity == SEVERITY_ERROR


# ---------------------------------------------------------------------------
# End-to-end via main + allow-list
# ---------------------------------------------------------------------------


def test_current_history_passes(tmp_path: Path) -> None:
    assert main(["--versions-dir", str(DEFAULT_VERSIONS_DIR)]) == 0


def test_new_migration_violation_exits_non_zero(tmp_path: Path) -> None:
    _write(tmp_path, "a.py", revision="a", down_revision=None)
    _write(
        tmp_path,
        "bad.py",
        revision="dd44ee55",
        down_revision="a",
        description="",
        upgrade_body="    op.drop_table('legacy')",
    )
    assert main(["--versions-dir", str(tmp_path)]) == 1


def test_missing_versions_dir_returns_two(tmp_path: Path) -> None:
    missing = tmp_path / "does-not-exist"
    assert main(["--versions-dir", str(missing)]) == 2
