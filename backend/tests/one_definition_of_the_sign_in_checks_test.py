"""There is one sign-in check and one CSRF check, and both are in deps.

``main.py`` once had its own copy of each beside the ones in
``app/deps.py``. They made the same decisions, but two copies of the
code that decides who is signed in is one more than can be kept the
same: the copy in ``main`` had already fallen behind, and did not put
the caller's id in the log context. These tests fail if a second copy
comes back.
"""

from __future__ import annotations

import ast
from pathlib import Path

import app.deps as deps
import app.main as main

APP = Path(__file__).resolve().parents[1] / "app"

# The names that must be defined once, in `app/deps.py`.
ONE_DEFINITION = frozenset({"get_current_user", "require_csrf"})


# The names six routers once gave their own wrappers round the two
# checks, from when importing them meant importing `main.py` back. A
# wrapper is a second place for the check to go wrong, and it ran the
# sign-in check twice on every request that also checked CSRF.
WRAPPERS = frozenset({"_get_current_user", "_require_csrf"})


def _defined_in(path: Path) -> set[str]:
    """The functions a file defines at its top level."""
    tree = ast.parse(path.read_text(encoding="utf-8"))

    return {
        node.name
        for node in tree.body
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
    }


def test_the_checks_are_defined_in_deps() -> None:
    assert ONE_DEFINITION <= _defined_in(APP / "deps.py")


def test_no_other_module_defines_a_check_of_the_same_name() -> None:
    sources = [
        path
        for path in sorted(APP.rglob("*.py"))
        if not path.name.endswith("_test.py") and path.name != "deps.py"
    ]
    # A floor: a wrong folder would find no files and so no copies.
    assert len(sources) > 100

    copies = {
        str(path.relative_to(APP)): sorted(_defined_in(path) & ONE_DEFINITION)
        for path in sources
        if _defined_in(path) & ONE_DEFINITION
    }

    assert copies == {}


def test_no_router_wraps_a_check_in_a_function_of_its_own() -> None:
    sources = [
        path
        for path in sorted(APP.rglob("*.py"))
        if not path.name.endswith("_test.py")
    ]
    assert len(sources) > 100

    wrappers = {
        str(path.relative_to(APP)): sorted(_defined_in(path) & WRAPPERS)
        for path in sources
        if _defined_in(path) & WRAPPERS
    }

    assert wrappers == {}


def test_main_uses_the_dependencies_from_deps() -> None:
    assert main.DEP_CURRENT_USER is deps.DEP_CURRENT_USER
    assert main.DEP_REQUIRE_CSRF is deps.DEP_REQUIRE_CSRF
    assert main.DEP_GET_SESSION is deps.DEP_GET_SESSION
