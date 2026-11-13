"""No test names a real framework.

The tests use the two made-up frameworks, ``quill_test`` and
``quill_2_test``, from Quill's testing repositories. A real framework
changes whenever its publisher changes it, so a test built on one breaks,
or quietly tests something stale. Without this check, the next test
written by copying a real id would bring that back.

The real ids are read from ``local.framework_repositories`` in
``infra/main.tf``, the list App production syncs, so a framework added
there is checked from then on. A real id is found as a quoted string: the
framework's id itself, or one of its competency ids, which start with the
id and an underscore. Quill has names of its own that can start the same
way, such as the position ``clinical_lead``, so a name the application code
also uses is Quill's own, not a framework's: no application code names a
framework.
"""

import re
from collections.abc import Iterator
from pathlib import Path

from app.paths import PROJECT_ROOT

INFRA_MAIN = PROJECT_ROOT / "infra" / "main.tf"
#: The backend folder: /app in the unit-test container, so not PROJECT_ROOT.
BACKEND = Path(__file__).resolve().parent.parent
FRONTEND_SRC = PROJECT_ROOT / "frontend" / "src"
FRONTEND_E2E = PROJECT_ROOT / "frontend" / "e2e"
FIXTURES = PROJECT_ROOT / "shared" / "framework-fixtures"

#: Folders that hold no source of ours, wherever they turn up.
SKIPPED_FOLDERS = {
    "node_modules",
    ".venv",
    "__pycache__",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".hypothesis",
}

#: Files that use a real framework's id to mean something else.
EXEMPT = {
    # The word there names the clinical feature chunk, not the framework.
    "frontend/src/featureChunks.test.ts",
}

#: A quoted string, in any of the quotes Python and TypeScript use.
QUOTED = re.compile(r"""["'`]([a-z0-9_]+)["'`]""")

#: A name in code, such as a field, a variable or a key.
WORD = re.compile(r"\b[a-z0-9_]+\b")


def _real_framework_ids() -> set[str]:
    """Each framework id App production syncs, from infra/main.tf."""
    text = INFRA_MAIN.read_text()
    block = re.search(
        r"framework_repositories\s*=\s*\{(.*?)\n\s*\}", text, re.S
    )
    assert block is not None, "infra/main.tf has no framework_repositories."

    ids: set[str] = set()

    for line in block[1].splitlines():
        if "=" in line:
            ids.update(re.findall(r'"([a-z0-9_]+)"', line.split("=", 1)[1]))

    return ids


def _files(folder: Path, wanted: str = "*") -> Iterator[Path]:
    """Every file under one folder, outside the folders of no source."""
    for path in folder.rglob(wanted):
        if path.is_file() and not SKIPPED_FOLDERS & set(path.parts):
            yield path


def _is_test(path: Path) -> bool:
    """Whether a file is a test, a story or a fixture of one."""
    name = path.name
    in_tests = "tests" in path.parts or "test" in path.parts

    return (
        name.endswith("_test.py")
        or name == "conftest.py"
        or ".test." in name
        or ".stories." in name
        or name == "fixtures.ts"
        or in_tests
    )


def _checked_files() -> Iterator[Path]:
    """The tests, stories, end-to-end tests, seeds and fixtures."""
    for path in _files(BACKEND, "*.py"):
        if _is_test(path) or "scripts" in path.parts:
            yield path

    for path in _files(FRONTEND_SRC):
        if _is_test(path):
            yield path

    yield from _files(FRONTEND_E2E)
    yield from _files(FIXTURES)


def _quills_own_names() -> set[str]:
    """Every name the application code uses, quoted or not."""
    app_files = [
        *(p for p in _files(BACKEND / "app", "*.py") if not _is_test(p)),
        *(p for p in _files(FRONTEND_SRC) if not _is_test(p)),
    ]
    names: set[str] = set()

    for path in app_files:
        names.update(WORD.findall(path.read_text(errors="ignore")))

    return names


def _real_ids_in(text: str, real_ids: set[str], quills: set[str]) -> set[str]:
    """The quoted strings in some text that name a real framework."""
    found: set[str] = set()

    for name in QUOTED.findall(text):
        if name in quills and name not in real_ids:
            continue
        for real_id in real_ids:
            if name == real_id or name.startswith(real_id + "_"):
                found.add(name)

    return found


def test_infra_lists_the_real_frameworks() -> None:
    """The list is read, so an empty one cannot pass the check by accident."""
    assert len(_real_framework_ids()) >= 1


def test_the_check_finds_a_framework_and_its_competency() -> None:
    real = {"made_up_board"}
    text = 'frameworks: ["made_up_board"], id: "made_up_board_take_a_history"'

    assert _real_ids_in(text, real, set()) == {
        "made_up_board",
        "made_up_board_take_a_history",
    }


def test_the_check_passes_over_quills_own_names() -> None:
    real = {"made_up_board"}
    text = 'role: "made_up_board_member", id: "made_up_board_take_a_history"'

    assert _real_ids_in(text, real, {"made_up_board_member"}) == {
        "made_up_board_take_a_history"
    }


def test_no_test_names_a_real_framework() -> None:
    real_ids = _real_framework_ids()
    quills = _quills_own_names()
    found: list[str] = []

    for path in _checked_files():
        relative = path.relative_to(PROJECT_ROOT).as_posix()
        if relative in EXEMPT:
            continue
        names = _real_ids_in(path.read_text(errors="ignore"), real_ids, quills)
        if names:
            found.append(f"{relative}: {', '.join(sorted(names))}")

    assert not found, (
        "Use quill_test or quill_2_test instead of a real framework:\n"
        + "\n".join(found)
    )
