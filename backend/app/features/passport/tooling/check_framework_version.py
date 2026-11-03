"""Every change to a framework moves its version up by exactly one.

Compares each framework file on the branch with the same file on
``origin/main``, modelled on
:mod:`app.features.teaching.tooling.check_version_lock`. A framework's
``version`` is Quill's count of changes to it, and every sign-off records
the version it was given under, so a change that leaves the number alone
would let two different frameworks share one version.

**Parsed content, not text, is compared.** So comments and spacing need no
new version, and neither does ``description``, which is shown to nobody
and left out of the comparison. Everything else does, a typo fix
included: no check can tell a typo from a change of meaning, "by" from
"bye". Agreed with the product owner on 2 November 2026; see
``docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md``.

**Every reworded competency is printed, pass or fail.** A change of
meaning needs a new id, not only a new version, and only a person can
tell which a rewording is, so the reviewer is shown both wordings. In
CI they also go to the job summary.

Needs only the standard library and PyYAML, so a CI job can run it
without the backend installed::

    cd backend
    python -m app.features.passport.tooling.check_framework_version \\
        ../shared/competency-definitions

Exit codes: 0 when every framework passes, 1 when any does not.
"""

from __future__ import annotations

import os
import subprocess  # noqa: S404 - git plumbing, fixed argv, never shell
import sys
from dataclasses import dataclass, field
from pathlib import Path

import yaml

#: Fields left out of the comparison, by the block they sit in. The
#: version is what is being checked, and the description is internal.
_IGNORED_FRAMEWORK_FIELDS: tuple[str, ...] = ("version", "description")


@dataclass(frozen=True)
class Rewording:
    """One existing id whose words changed."""

    framework_id: str
    where: str
    old: str
    new: str

    def __str__(self) -> str:
        return (
            f"  {self.framework_id}: {self.where}\n"
            f"    was: {self.old}\n"
            f"    now: {self.new}"
        )


@dataclass
class VersionResult:
    """What the check found across every framework file."""

    violations: list[str] = field(default_factory=list)
    rewordings: list[Rewording] = field(default_factory=list)
    checked: int = 0

    @property
    def passed(self) -> bool:
        return not self.violations

    def summary(self) -> str:
        lines = [f"Framework versions: checked {self.checked} framework(s)."]

        if self.passed:
            lines.append("All passed.")
        else:
            lines.append(f"{len(self.violations)} problem(s):")
            lines.extend(f"  FAIL {v}" for v in self.violations)

        if self.rewordings:
            lines.append("")
            lines.append(
                f"{len(self.rewordings)} reworded: check each keeps its "
                "meaning. A change of meaning needs a new id."
            )
            lines.extend(str(r) for r in self.rewordings)

        return "\n".join(lines)


# ------------------------------------------------------------------
# Reading
# ------------------------------------------------------------------


def _git_show(root: Path, ref: str, path: str) -> str | None:
    """A file's text at *ref*, or None where it does not exist there."""
    try:
        # A fixed argument list and no shell.
        result = subprocess.run(  # noqa: S603  # nosec B607 B603
            ["git", "show", f"{ref}:{path}"],  # noqa: S607
            capture_output=True,
            text=True,
            check=True,
            cwd=root,
        )
    except subprocess.CalledProcessError:
        return None

    return result.stdout


def _parse(text: str) -> dict[str, object] | None:
    """A parsed definition file, or None when it is not a mapping."""
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError:
        return None

    if not isinstance(data, dict):
        return None

    return {str(key): value for key, value in data.items()}


def _framework_block(data: dict[str, object]) -> dict[str, object] | None:
    """The ``framework:`` block, or None for a file declaring none."""
    block = data.get("framework")

    if not isinstance(block, dict):
        return None

    return {str(key): value for key, value in block.items()}


def _version_of(block: dict[str, object]) -> int | None:
    """The block's version, or None when it is not a whole number.

    ``bool`` is refused explicitly: it subclasses ``int``, so a YAML
    ``yes`` would otherwise read as 1.
    """
    raw = block.get("version")

    if isinstance(raw, bool) or not isinstance(raw, int):
        return None

    return raw


def _comparable(data: dict[str, object]) -> dict[str, object]:
    """The file's content with the fields this check ignores taken out."""
    block = _framework_block(data) or {}
    kept = {
        key: value
        for key, value in block.items()
        if key not in _IGNORED_FRAMEWORK_FIELDS
    }

    return {**data, "framework": kept}


# ------------------------------------------------------------------
# Rewordings
# ------------------------------------------------------------------


def _by_id(items: object) -> dict[str, dict[str, object]]:
    """A list of ``{id: ...}`` mappings, keyed by id."""
    if not isinstance(items, list):
        return {}

    found: dict[str, dict[str, object]] = {}

    for item in items:
        if isinstance(item, dict) and isinstance(item.get("id"), str):
            found[item["id"]] = {str(k): v for k, v in item.items()}

    return found


def _reworded(
    framework_id: str, old: dict[str, object], new: dict[str, object]
) -> list[Rewording]:
    """Every id on both sides whose words differ.

    A competency's ``display_name``, and each level's and scope's
    ``name``. An id only on one side is an addition or a retirement, which
    the version check covers, not a rewording.
    """
    found: list[Rewording] = []
    old_competencies = _by_id(old.get("competencies"))

    for cid, now in _by_id(new.get("competencies")).items():
        was = old_competencies.get(cid)
        if was is None:
            continue

        if was.get("display_name") != now.get("display_name"):
            found.append(
                Rewording(
                    framework_id,
                    cid,
                    str(was.get("display_name")),
                    str(now.get("display_name")),
                )
            )

        for kind in ("levels", "scopes"):
            old_parts = _by_id(was.get(kind))
            for part_id, part in _by_id(now.get(kind)).items():
                before = old_parts.get(part_id)
                if before is not None and before.get("name") != part.get(
                    "name"
                ):
                    found.append(
                        Rewording(
                            framework_id,
                            f"{cid}, {kind[:-1]} {part_id}",
                            str(before.get("name")),
                            str(part.get("name")),
                        )
                    )

    return found


# ------------------------------------------------------------------
# The check
# ------------------------------------------------------------------


def check_file(
    path: Path, root: Path, rel_path: str, ref: str, result: VersionResult
) -> None:
    """Check one framework file against the same file at *ref*.

    Args:
        path: The file on the branch.
        root: The repository it is in.
        rel_path: Its path from the repository root, for ``git show``.
        ref: What to compare with, normally ``origin/main``.
        result: Where violations and rewordings are recorded.
    """
    new = _parse(path.read_text(encoding="utf-8"))
    block = _framework_block(new) if new is not None else None

    if new is None or block is None:
        return

    result.checked += 1
    framework_id = str(block.get("id", path.stem))
    version = _version_of(block)

    if version is None:
        result.violations.append(
            f"{rel_path}: version must be a whole number."
        )
        return

    old_text = _git_show(root, ref, rel_path)
    old = _parse(old_text) if old_text is not None else None
    old_block = _framework_block(old) if old is not None else None

    if old is None or old_block is None:
        if version != 1:
            result.violations.append(
                f"{rel_path}: a new framework starts at version 1 "
                f"(found {version})."
            )
        return

    result.rewordings.extend(_reworded(framework_id, old, new))
    old_version = _version_of(old_block)

    if old_version is None:
        # Before versions were numbers. Anything at 1 or more is a start.
        return

    changed = _comparable(old) != _comparable(new)

    if version < old_version:
        result.violations.append(
            f"{rel_path}: version went down from {old_version} to "
            f"{version}."
        )
    elif version > old_version + 1:
        result.violations.append(
            f"{rel_path}: version jumped from {old_version} to {version}; "
            "it goes up by exactly one. If a branch below this one in its "
            "stack also changes this framework, land that one first: this "
            "check compares with main."
        )
    elif changed and version == old_version:
        result.violations.append(
            f"{rel_path}: the framework changed but its version is still "
            f"{old_version}. Move it to {old_version + 1}."
        )
    elif not changed and version != old_version:
        result.violations.append(
            f"{rel_path}: the version moved to {version} but nothing else "
            f"in the framework did. Put it back to {old_version}."
        )


def _repo_root(directory: Path) -> Path | None:
    """The repository holding *directory*, or None outside one."""
    try:
        completed = subprocess.run(  # noqa: S603  # nosec B607 B603
            ["git", "rev-parse", "--show-toplevel"],  # noqa: S607
            capture_output=True,
            text=True,
            check=True,
            cwd=directory,
        )
    except subprocess.CalledProcessError, OSError:
        return None

    return Path(completed.stdout.strip())


def check_framework_versions(
    directory: Path, ref: str = "origin/main"
) -> VersionResult:
    """Check every framework file in *directory* against *ref*.

    Args:
        directory: The folder of definition files on the branch.
        ref: The git ref to compare with.

    Returns:
        What was found.
    """
    result = VersionResult()

    if not directory.is_dir():
        result.violations.append(f"{directory} is not a directory.")
        return result

    root = _repo_root(directory)

    if root is None:
        result.violations.append(
            f"{directory} is not inside a git repository, so there is "
            "nothing to compare with."
        )
        return result

    rel_dir = directory.resolve().relative_to(root.resolve())

    for path in sorted(directory.glob("*.yaml")):
        check_file(
            path, root, f"{rel_dir.as_posix()}/{path.name}", ref, result
        )

    return result


def main(argv: list[str] | None = None) -> int:
    """CLI entry point."""
    args = argv if argv is not None else sys.argv[1:]

    if not args:
        print(
            "Usage: python -m app.features.passport.tooling."
            "check_framework_version <definitions-directory> [<ref>]"
        )
        return 1

    ref = args[1] if len(args) > 1 else "origin/main"
    result = check_framework_versions(Path(args[0]), ref)
    summary = result.summary()
    print(summary)

    step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary:
        with open(step_summary, "a", encoding="utf-8") as out:
            out.write("## Framework versions\n\n```text\n")
            out.write(summary)
            out.write("\n```\n")

    return 0 if result.passed else 1


if __name__ == "__main__":
    sys.exit(main())
