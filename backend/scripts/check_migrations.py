"""Static safety checks for Alembic migration files.

Pure-stdlib (``ast``, ``pathlib``) — no database access and no import of
the application package — so it is safe to run inside a pre-commit hook.

Every ``backend/alembic/versions/*.py`` file is parsed and checked for:

1. Chain integrity — exactly one base and one head; no reused
   ``down_revision`` (a branch); no cycles.
2. Non-empty description — the module docstring must carry a summary
   line above the Alembic boilerplate.
3. Reversibility — a new migration's ``downgrade()`` must not be empty;
   an empty / ``pass``-only / missing body is a hard failure.
4. NOT NULL trap — any ``add_column`` / ``alter_column`` that sets
   ``nullable=False`` must also pass ``server_default=`` in the same call.
5. Destructive ops — ``drop_column`` / ``drop_table`` / ``drop_constraint``
   in ``upgrade()`` require an explicit ``# migration-check:
   allow-destructive`` marker to force expand-contract deliberateness.

The pre-launch history was squashed into a single compliant baseline, so
every migration — the baseline included — is held to the full standard.
There is no grandfathering mechanism; a migration that fails a check
must be fixed, not exempted.

Run with::

    python backend/scripts/check_migrations.py --all
"""

from __future__ import annotations

import argparse
import ast
import sys
from dataclasses import dataclass
from pathlib import Path

DESTRUCTIVE_MARKER = "# migration-check: allow-destructive"
DESTRUCTIVE_OPS: frozenset[str] = frozenset(
    {"drop_column", "drop_table", "drop_constraint"}
)

DEFAULT_VERSIONS_DIR = (
    Path(__file__).resolve().parents[1] / "alembic" / "versions"
)

SEVERITY_ERROR = "error"
SEVERITY_WARNING = "warning"


@dataclass(frozen=True)
class Problem:
    """A single check failure or warning."""

    severity: str
    message: str
    path: Path | None = None


@dataclass
class Migration:
    """The parsed contents of a single migration module."""

    path: Path
    revision: str | None
    down_revision: str | None
    docstring: str | None
    upgrade: ast.FunctionDef | None
    downgrade: ast.FunctionDef | None
    source: str


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------


def _string_value(node: ast.expr | None) -> str | None:
    """Return the string value of a constant node, else None."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def _assigned_value(tree: ast.Module, name: str) -> str | None:
    """Return the string assigned to a top-level annotated ``name``."""
    for node in tree.body:
        if (
            isinstance(node, ast.AnnAssign)
            and isinstance(node.target, ast.Name)
            and node.target.id == name
        ):
            return _string_value(node.value)
    return None


def _function(tree: ast.Module, name: str) -> ast.FunctionDef | None:
    """Return the top-level function named ``name``, else None."""
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == name:
            return node
    return None


def _call_name(call: ast.Call) -> str | None:
    """Return the called function's bare name (attribute or name)."""
    if isinstance(call.func, ast.Attribute):
        return call.func.attr
    if isinstance(call.func, ast.Name):
        return call.func.id
    return None


def _has_keyword(call: ast.Call, name: str) -> bool:
    """Return True if ``call`` passes a keyword named ``name``."""
    return any(kw.arg == name for kw in call.keywords)


def _keyword_is_false(call: ast.Call, name: str) -> bool:
    """Return True if ``call`` passes ``name=False`` literally."""
    for kw in call.keywords:
        if (
            kw.arg == name
            and isinstance(kw.value, ast.Constant)
            and kw.value.value is False
        ):
            return True
    return False


def collect_migrations(versions_dir: Path) -> list[Migration]:
    """Parse every migration module in ``versions_dir``."""
    migrations: list[Migration] = []
    for path in sorted(versions_dir.glob("*.py")):
        if path.name == "__init__.py":
            continue
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(path))
        migrations.append(
            Migration(
                path=path,
                revision=_assigned_value(tree, "revision"),
                down_revision=_assigned_value(tree, "down_revision"),
                docstring=ast.get_docstring(tree, clean=False),
                upgrade=_function(tree, "upgrade"),
                downgrade=_function(tree, "downgrade"),
                source=source,
            )
        )
    return migrations


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------


def check_chain_integrity(migrations: list[Migration]) -> list[Problem]:
    """Check the revision graph is a single, linear, acyclic chain."""
    problems: list[Problem] = []
    by_revision: dict[str, Migration] = {}

    for migration in migrations:
        if migration.revision is None:
            problems.append(
                Problem(
                    SEVERITY_ERROR,
                    "could not determine the revision id",
                    migration.path,
                )
            )
            continue
        if migration.revision in by_revision:
            problems.append(
                Problem(
                    SEVERITY_ERROR,
                    f"duplicate revision id '{migration.revision}'",
                    migration.path,
                )
            )
            continue
        by_revision[migration.revision] = migration

    if not by_revision:
        return problems

    bases = [m for m in by_revision.values() if m.down_revision is None]
    if not bases:
        problems.append(
            Problem(SEVERITY_ERROR, "no base migration found (one expected)")
        )
    elif len(bases) > 1:
        names = ", ".join(sorted(str(m.revision) for m in bases))
        problems.append(
            Problem(
                SEVERITY_ERROR,
                f"multiple base migrations found ({names}); one expected",
            )
        )

    children: dict[str, list[Migration]] = {}
    for migration in by_revision.values():
        parent = migration.down_revision
        if parent is None:
            continue
        if parent not in by_revision:
            problems.append(
                Problem(
                    SEVERITY_ERROR,
                    f"down_revision '{parent}' matches no known revision",
                    migration.path,
                )
            )
        children.setdefault(parent, []).append(migration)

    for parent, kids in children.items():
        if len(kids) > 1:
            names = ", ".join(sorted(str(k.revision) for k in kids))
            problems.append(
                Problem(
                    SEVERITY_ERROR,
                    f"revision '{parent}' has multiple children ({names}); "
                    "the chain must be linear",
                )
            )

    referenced = {
        m.down_revision
        for m in by_revision.values()
        if m.down_revision is not None
    }
    heads = [m for rev, m in by_revision.items() if rev not in referenced]
    if len(heads) > 1:
        names = ", ".join(sorted(str(h.revision) for h in heads))
        problems.append(
            Problem(
                SEVERITY_ERROR,
                f"multiple heads found ({names}); exactly one expected",
            )
        )

    if _has_cycle(by_revision):
        problems.append(
            Problem(SEVERITY_ERROR, "cycle detected in the revision chain")
        )

    return problems


def _has_cycle(by_revision: dict[str, Migration]) -> bool:
    """Return True if following ``down_revision`` links forms a cycle."""
    for start in by_revision:
        seen: set[str] = set()
        current: str | None = start
        while current is not None:
            if current in seen:
                return True
            seen.add(current)
            migration = by_revision.get(current)
            if migration is None:
                break
            current = migration.down_revision
    return False


def _description(docstring: str | None) -> str:
    """Extract the human summary above the Alembic boilerplate."""
    if not docstring:
        return ""
    lines: list[str] = []
    for line in docstring.splitlines():
        if line.strip().startswith("Revision ID:"):
            break
        lines.append(line)
    return "\n".join(lines).strip()


def check_description(migration: Migration) -> list[Problem]:
    """Check the migration carries a non-empty description."""
    if _description(migration.docstring):
        return []
    return [
        Problem(
            SEVERITY_ERROR,
            "empty description; add a summary line to the module docstring",
            migration.path,
        )
    ]


def _is_effectively_empty(function: ast.FunctionDef | None) -> bool:
    """Return True if a function body does nothing (pass/docstring/...)."""
    if function is None:
        return True
    for statement in function.body:
        if isinstance(statement, ast.Pass):
            continue
        if isinstance(statement, ast.Expr) and isinstance(
            statement.value, ast.Constant
        ):
            value = statement.value.value
            if isinstance(value, str) or value is Ellipsis:
                continue
        return False
    return True


def check_reversibility(migration: Migration) -> list[Problem]:
    """Fail when ``downgrade()`` provides no real reversal."""
    if not _is_effectively_empty(migration.downgrade):
        return []
    return [
        Problem(
            SEVERITY_ERROR,
            "downgrade() is empty; provide a real reversal so the "
            "migration can be rolled back",
            migration.path,
        )
    ]


def check_not_null_trap(migration: Migration) -> list[Problem]:
    """Check NOT NULL columns on existing tables carry a server_default."""
    if migration.upgrade is None:
        return []
    problems: list[Problem] = []
    for node in ast.walk(migration.upgrade):
        if not isinstance(node, ast.Call):
            continue
        name = _call_name(node)
        if name == "add_column":
            for inner in ast.walk(node):
                if (
                    isinstance(inner, ast.Call)
                    and _call_name(inner) == "Column"
                    and _keyword_is_false(inner, "nullable")
                    and not _has_keyword(inner, "server_default")
                ):
                    problems.append(
                        Problem(
                            SEVERITY_ERROR,
                            "add_column adds a NOT NULL column without a "
                            "server_default; add server_default= or make it "
                            "nullable and backfill in a follow-up",
                            migration.path,
                        )
                    )
        elif name == "alter_column":
            if _keyword_is_false(node, "nullable") and not _has_keyword(
                node, "server_default"
            ):
                problems.append(
                    Problem(
                        SEVERITY_ERROR,
                        "alter_column sets nullable=False without a "
                        "server_default",
                        migration.path,
                    )
                )
    return problems


def check_destructive(migration: Migration) -> list[Problem]:
    """Check destructive ops carry the explicit allow marker."""
    if migration.upgrade is None:
        return []
    found: set[str] = set()
    for node in ast.walk(migration.upgrade):
        if isinstance(node, ast.Call):
            name = _call_name(node)
            if name in DESTRUCTIVE_OPS:
                found.add(name)
    if found and DESTRUCTIVE_MARKER not in migration.source:
        ops = ", ".join(sorted(found))
        return [
            Problem(
                SEVERITY_ERROR,
                f"upgrade() performs destructive operations ({ops}) without "
                f"the '{DESTRUCTIVE_MARKER}' marker; use expand-contract or "
                "add the marker to confirm intent",
                migration.path,
            )
        ]
    return []


def check_all(migrations: list[Migration]) -> list[Problem]:
    """Run every check against every migration."""
    problems: list[Problem] = list(check_chain_integrity(migrations))
    for migration in migrations:
        problems.extend(check_description(migration))
        problems.extend(check_reversibility(migration))
        problems.extend(check_not_null_trap(migration))
        problems.extend(check_destructive(migration))
    return problems


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _format(problem: Problem) -> str:
    location = f"{problem.path.name}: " if problem.path else ""
    return f"{problem.severity.upper()}: {location}{problem.message}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Static safety checks for Alembic migrations."
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Check every migration in the versions directory (default).",
    )
    parser.add_argument(
        "--versions-dir",
        type=Path,
        default=DEFAULT_VERSIONS_DIR,
        help="Path to the Alembic versions directory.",
    )
    args = parser.parse_args(argv)

    versions_dir: Path = args.versions_dir
    if not versions_dir.is_dir():
        print(
            f"error: versions directory not found: {versions_dir}",
            file=sys.stderr,
        )
        return 2

    migrations = collect_migrations(versions_dir)
    problems = check_all(migrations)

    warnings = [p for p in problems if p.severity == SEVERITY_WARNING]
    errors = [p for p in problems if p.severity == SEVERITY_ERROR]

    for problem in warnings:
        print(_format(problem), file=sys.stderr)
    for problem in errors:
        print(_format(problem), file=sys.stderr)

    if errors:
        print(
            f"\n{len(errors)} migration check error(s) found.",
            file=sys.stderr,
        )
        return 1
    if warnings:
        print(
            f"\n{len(warnings)} migration check warning(s) found.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
