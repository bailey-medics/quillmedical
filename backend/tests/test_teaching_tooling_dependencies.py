"""The tooling package's dependencies must match the backend's.

The package carries its own ``pyproject.toml`` so it can be installed on
its own, which means pydantic and pyyaml are declared twice. That is the
one duplication the design accepts, and this is what stops it drifting:
the same validator runs at both gates, so a version only one of them sees
is a version that can make them disagree.

If this fails, change whichever declaration is behind — do not relax the
test.
"""

from __future__ import annotations

import tomllib
from pathlib import Path

import pytest

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_TOOLING = _BACKEND_ROOT / "app" / "features" / "teaching" / "tooling"

#: Declared in both places, so both must agree.
SHARED_DEPENDENCIES = ("pydantic", "pyyaml")


def _load(path: Path) -> dict[str, object]:
    with open(path, "rb") as f:
        return tomllib.load(f)


def _poetry_dependencies(pyproject: Path) -> dict[str, object]:
    data = _load(pyproject)
    tool = data.get("tool")
    assert isinstance(tool, dict), f"no [tool] table in {pyproject}"
    poetry = tool.get("poetry")
    assert isinstance(poetry, dict), f"no [tool.poetry] in {pyproject}"
    deps = poetry.get("dependencies")
    assert isinstance(deps, dict), f"no dependencies in {pyproject}"
    return deps


@pytest.fixture(scope="module")
def backend_deps() -> dict[str, object]:
    return _poetry_dependencies(_BACKEND_ROOT / "pyproject.toml")


@pytest.fixture(scope="module")
def tooling_deps() -> dict[str, object]:
    return _poetry_dependencies(_TOOLING / "pyproject.toml")


class TestDeclarationsAgree:
    @pytest.mark.parametrize("package", SHARED_DEPENDENCIES)
    def test_the_constraint_is_identical(
        self,
        package: str,
        backend_deps: dict[str, object],
        tooling_deps: dict[str, object],
    ) -> None:
        assert package in backend_deps, f"{package} missing from the backend"
        assert package in tooling_deps, f"{package} missing from the tooling"
        assert tooling_deps[package] == backend_deps[package], (
            f"{package} is declared differently: backend says "
            f"{backend_deps[package]!r}, tooling says "
            f"{tooling_deps[package]!r}. The same validator runs at both "
            f"gates and must see the same version."
        )

    def test_python_requirements_are_identical(
        self,
        backend_deps: dict[str, object],
        tooling_deps: dict[str, object],
    ) -> None:
        """A looser requirement here would allow an interpreter the
        backend has ruled out."""
        assert tooling_deps["python"] == backend_deps["python"], (
            f"backend requires python {backend_deps['python']!r}, tooling "
            f"requires {tooling_deps['python']!r}"
        )


class TestToolingStaysMinimal:
    def test_it_declares_only_what_it_needs(
        self, tooling_deps: dict[str, object]
    ) -> None:
        """A new dependency here is a decision, not an accident.

        The package must stay installable without the backend's stack, so
        anything beyond python and the shared pair needs justifying.
        """
        declared = set(tooling_deps) - {"python"}
        assert declared == set(SHARED_DEPENDENCIES), (
            f"tooling declares {sorted(declared)}; if that is deliberate, "
            f"update SHARED_DEPENDENCIES and check the new package does not "
            f"pull in the backend's stack"
        )

    def test_it_does_not_reach_for_the_backend_stack(
        self, tooling_deps: dict[str, object]
    ) -> None:
        forbidden = {"fastapi", "sqlalchemy", "alembic", "psycopg", "uvicorn"}
        assert not forbidden & set(tooling_deps)


class TestLockIsPresent:
    def test_the_tooling_package_is_locked(self) -> None:
        """CI installs from the lock, so an unlocked package would resolve
        freely and could differ from what was tested here."""
        assert (_TOOLING / "poetry.lock").is_file()

    def test_it_bounds_the_poetry_that_may_read_the_lock(self) -> None:
        """The workflow pins which Poetry it installs, and that pin lives
        outside this package. This is the package's own say in the matter:
        a Poetry that cannot read this lock format fails loudly instead of
        resolving freely.
        """
        data = _load(_TOOLING / "pyproject.toml")
        tool = data.get("tool")
        assert isinstance(tool, dict)
        poetry = tool.get("poetry")
        assert isinstance(poetry, dict)
        assert poetry.get("requires-poetry"), (
            "no requires-poetry constraint; without it the workflow's pin "
            "is the only thing keeping the lock readable"
        )
