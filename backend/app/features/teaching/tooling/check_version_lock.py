"""Version lock enforcement for live teaching modules.

Checks that assessment changes in a pull request include the required
version bump.  Runs in CI against the branch, comparing to ``origin/main``.

Rules by module status on main:

- ``draft`` — version must remain 1
- ``retired`` — no changes allowed (permanently frozen)
- ``live`` — assessment changes require version +1

Usage::

    python -m app.features.teaching.tooling.check_version_lock <modules-dir>

Exit codes: 0 when every module passes, 1 when any violation is found.
"""

from __future__ import annotations

import subprocess  # noqa: S404 — git plumbing, fixed argv, never shell
import sys
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from app.features.teaching.tooling.module_schema import ModuleStatus

#: Status progression — only forward transitions are allowed.
STATUS_ORDER: dict[ModuleStatus, int] = {
    "draft": 0,
    "live": 1,
    "retired": 2,
}

#: Accepted assessment config filenames, in preference order.
_ASSESSMENT_FILENAMES = ("assessment.yaml", "config.yaml")


@dataclass
class LockViolation:
    """A single version lock violation."""

    module_id: str
    message: str

    def __str__(self) -> str:
        return f"  FAIL [{self.module_id}]: {self.message}"


@dataclass
class LockResult:
    """Aggregate result for all modules checked."""

    violations: list[LockViolation] = field(default_factory=list)
    modules_checked: int = 0
    modules_skipped: int = 0

    @property
    def passed(self) -> bool:
        return len(self.violations) == 0

    def add_violation(self, module_id: str, message: str) -> None:
        self.violations.append(
            LockViolation(module_id=module_id, message=message)
        )

    def summary(self) -> str:
        lines = [
            f"Version lock: checked {self.modules_checked} module(s), "
            f"skipped {self.modules_skipped}."
        ]
        if self.passed:
            lines.append("All passed.")
        else:
            lines.append(f"{len(self.violations)} violation(s):")
            for v in self.violations:
                lines.append(str(v))
        return "\n".join(lines)


# ------------------------------------------------------------------
# Git helpers
# ------------------------------------------------------------------


def _git_show(ref: str, path: str) -> str | None:
    """Read a file from a git ref. Returns None if the file is absent."""
    try:
        result = subprocess.run(  # noqa: S603
            ["git", "show", f"{ref}:{path}"],  # noqa: S607
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout
    except subprocess.CalledProcessError:
        return None


def _git_diff_names(ref: str, path: str) -> list[str]:
    """List changed files under *path* relative to *ref*."""
    result = subprocess.run(  # noqa: S603
        ["git", "diff", "--name-only", ref, "--", path],  # noqa: S607
        capture_output=True,
        text=True,
        check=True,
    )
    return [
        line.strip() for line in result.stdout.splitlines() if line.strip()
    ]


# ------------------------------------------------------------------
# YAML reading — narrow untyped input at the boundary
# ------------------------------------------------------------------


def _as_mapping(data: object) -> dict[str, object] | None:
    """Coerce a parsed YAML document to a string-keyed mapping."""
    if not isinstance(data, dict):
        return None
    return {str(key): value for key, value in data.items()}


def _load_yaml(content: str) -> dict[str, object] | None:
    """Parse YAML content, returning None when it is not a mapping."""
    try:
        return _as_mapping(yaml.safe_load(content))
    except yaml.YAMLError:
        return None


def _read_yaml_file(path: Path) -> dict[str, object] | None:
    """Read and parse a YAML file, returning None when unusable."""
    try:
        with open(path, encoding="utf-8") as f:
            return _as_mapping(yaml.safe_load(f))
    except (OSError, yaml.YAMLError):
        return None


def _status_of(data: Mapping[str, object]) -> ModuleStatus | None:
    """Extract a recognised lifecycle status, or None."""
    raw = data.get("status")
    if raw == "draft":
        return "draft"
    if raw == "live":
        return "live"
    if raw == "retired":
        return "retired"
    return None


def _version_of(data: Mapping[str, object]) -> int | None:
    """Extract an integer version, or None.

    ``bool`` is rejected explicitly: it subclasses ``int``, so without this
    a YAML ``version: yes`` would silently read as ``1``.
    """
    raw = data.get("version")
    if isinstance(raw, bool) or not isinstance(raw, int):
        return None
    return raw


def _get_assessment_version(module_dir: Path) -> int | None:
    """Read the version from the branch's assessment config."""
    for name in _ASSESSMENT_FILENAMES:
        data = _read_yaml_file(module_dir / "assessment" / name)
        if data is not None:
            version = _version_of(data)
            if version is not None:
                return version
    return None


def _get_main_assessment_version(
    ref: str, modules_rel_path: str, module_id: str
) -> int | None:
    """Read the version from *ref*'s assessment config."""
    for name in _ASSESSMENT_FILENAMES:
        content = _git_show(
            ref, f"{modules_rel_path}/{module_id}/assessment/{name}"
        )
        if content is None:
            continue
        data = _load_yaml(content)
        if data is not None:
            version = _version_of(data)
            if version is not None:
                return version
    return None


# ------------------------------------------------------------------
# Per-module checks
# ------------------------------------------------------------------


def _check_live_module(
    module_dir: Path,
    modules_rel_path: str,
    ref: str,
    module_id: str,
    result: LockResult,
) -> None:
    """A live module's assessment changes must bump the version by one."""
    changed_assessment = _git_diff_names(
        ref, f"{modules_rel_path}/{module_id}/assessment/"
    )
    if not changed_assessment:
        return

    main_version = _get_main_assessment_version(
        ref, modules_rel_path, module_id
    )
    pr_version = _get_assessment_version(module_dir)

    if main_version is None:
        result.add_violation(
            module_id, "cannot read version from main's assessment.yaml"
        )
        return
    if pr_version is None:
        result.add_violation(
            module_id, "cannot read version from PR's assessment.yaml"
        )
        return

    if pr_version == main_version:
        result.add_violation(
            module_id,
            f"assessment files changed but version not bumped "
            f"(still {main_version})",
        )
    elif pr_version > main_version + 1:
        result.add_violation(
            module_id,
            f"version jumped from {main_version} to {pr_version} "
            f"(must increment by exactly 1)",
        )
    elif pr_version < main_version:
        result.add_violation(
            module_id,
            f"version decreased from {main_version} to {pr_version}",
        )


def check_module(
    module_dir: Path,
    modules_rel_path: str,
    ref: str,
    result: LockResult,
) -> None:
    """Check version lock rules for a single module."""
    module_id = module_dir.name
    result.modules_checked += 1

    main_module_content = _git_show(
        ref, f"{modules_rel_path}/{module_id}/module.yaml"
    )
    if main_module_content is None:
        # New module — nothing to protect.
        result.modules_skipped += 1
        return

    main_module = _load_yaml(main_module_content)
    if main_module is None:
        result.modules_skipped += 1
        return

    main_status = _status_of(main_module)

    pr_module = _read_yaml_file(module_dir / "module.yaml")
    pr_status = _status_of(pr_module) if pr_module is not None else None

    # Block backwards status transitions (draft → live → retired only).
    if (
        main_status is not None
        and pr_status is not None
        and STATUS_ORDER[pr_status] < STATUS_ORDER[main_status]
    ):
        result.add_violation(
            module_id,
            f"status cannot move backwards from '{main_status}' to "
            f"'{pr_status}' (allowed: draft → live → retired)",
        )
        return

    if main_status == "draft":
        pr_version = _get_assessment_version(module_dir)
        if pr_version is not None and pr_version != 1:
            result.add_violation(
                module_id,
                f"version must stay at 1 while module is draft "
                f"(found {pr_version})",
            )
        return

    if main_status == "retired":
        changed = _git_diff_names(ref, f"{modules_rel_path}/{module_id}/")
        if changed:
            result.add_violation(
                module_id,
                "retired modules are permanently frozen; "
                "create a new module instead "
                f"({len(changed)} file(s) changed)",
            )
        return

    if main_status == "live":
        _check_live_module(
            module_dir, modules_rel_path, ref, module_id, result
        )
        return

    # Unrecognised status — skipped; validate.py reports the schema error.
    result.modules_skipped += 1


def _repo_relative_path(modules_dir: Path) -> str | None:
    """Path of *modules_dir* relative to its git repository root.

    Returns None when there is no repository, or when the directory sits
    outside the one git reports — validating a tree downloaded from GCS, for
    instance.  Callers report that rather than letting it raise: a traceback
    is a poor way to tell someone they wanted ``--skip-version-lock``.
    """
    try:
        completed = subprocess.run(  # noqa: S603
            ["git", "rev-parse", "--show-toplevel"],  # noqa: S607
            capture_output=True,
            text=True,
            check=True,
        )
    except (subprocess.CalledProcessError, OSError):
        return None

    repo_root = Path(completed.stdout.strip())
    try:
        return str(modules_dir.resolve().relative_to(repo_root))
    except ValueError:
        return None


def check_version_lock(
    modules_dir: Path, ref: str = "origin/main"
) -> LockResult:
    """Check version lock for every module in *modules_dir*.

    Parameters
    ----------
    modules_dir:
        Path to the ``modules/`` directory on the branch under test.
    ref:
        Git ref to compare against.

    Returns
    -------
    A :class:`LockResult` carrying any violations found.
    """
    result = LockResult()

    if not modules_dir.is_dir():
        result.add_violation("(root)", "modules/ directory not found")
        return result

    # git show/diff need paths relative to the repository root.
    modules_rel_path = _repo_relative_path(modules_dir)
    if modules_rel_path is None:
        result.add_violation(
            "(root)",
            f"{modules_dir} is not inside a git repository, so version lock "
            "cannot compare against a ref — pass --skip-version-lock when "
            "validating content that has no git history",
        )
        return result

    module_dirs = sorted(
        d
        for d in modules_dir.iterdir()
        if d.is_dir() and not d.name.startswith(".")
    )

    for module_dir in module_dirs:
        check_module(module_dir, modules_rel_path, ref, result)

    return result


def main(argv: list[str] | None = None) -> int:
    """CLI entry point."""
    args = argv if argv is not None else sys.argv[1:]

    if not args:
        print(
            "Usage: python -m app.features.teaching.tooling."
            "check_version_lock <modules-directory>"
        )
        return 1

    result = check_version_lock(Path(args[0]))
    print(result.summary())
    return 0 if result.passed else 1


if __name__ == "__main__":
    sys.exit(main())
