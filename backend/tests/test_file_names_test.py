"""Every file that holds tests is named ``<something>_test.py``.

pytest is told to collect that name and no other (``python_files`` in
``pyproject.toml``). So a test written into a file with any other name,
``test_brand.py`` above all, is never run, and nothing says so: the suite
passes with one file fewer. This is what says so.

It reads the syntax tree and not the file name alone, because a source
file may start with ``test_`` and hold no tests. One did:
``app/compat_harness_endpoints.py`` was ``test_api_endpoints.py``, and its
classes are still called ``TestBreakingResponse1`` and so on. They are
Pydantic models, with no test in them.
"""

import ast
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent

#: Where tests may be. Not the virtual environment, whose packages name
#: their own tests however they like.
_SEARCHED = ("app", "tests", "scripts", "alembic")


def holds_tests(source: str) -> bool:
    """Whether Python source defines anything pytest would run.

    A function at the top of the file whose name starts ``test_``, or a
    class whose name starts ``Test`` with such a method in it. A class
    named ``Test...`` with no test method is not a test: it is how the
    compatibility harness names its models.

    Args:
        source: The contents of a Python file.

    Returns:
        True if it holds a test.
    """
    functions = (ast.FunctionDef, ast.AsyncFunctionDef)

    for node in ast.parse(source).body:
        if isinstance(node, functions) and node.name.startswith("test_"):
            return True

        if isinstance(node, ast.ClassDef) and node.name.startswith("Test"):
            if any(
                isinstance(member, functions)
                and member.name.startswith("test_")
                for member in node.body
            ):
                return True

    return False


def _python_files() -> list[Path]:
    return sorted(
        path
        for folder in _SEARCHED
        for path in (BACKEND / folder).rglob("*.py")
        if "__pycache__" not in path.parts
    )


def _misnamed() -> list[str]:
    return [
        str(path.relative_to(BACKEND))
        for path in _python_files()
        if not path.name.endswith("_test.py")
        and holds_tests(path.read_text(encoding="utf-8"))
    ]


def test_no_file_holding_tests_has_a_name_pytest_will_not_collect() -> None:
    assert _misnamed() == [], (
        "These hold tests that never run, because pytest collects only "
        "*_test.py. Rename each to end _test.py."
    )


def test_nothing_in_the_tests_folder_keeps_the_old_prefix() -> None:
    """``test_<what>.py`` was the name until 9 October 2026."""
    old = sorted(p.name for p in (BACKEND / "tests").rglob("test_*.py"))

    # This file is about test file names, and is named for its subject.
    assert [name for name in old if not name.endswith("_test.py")] == []


def test_the_search_finds_the_tests_it_should() -> None:
    """A check that looks nowhere finds nothing wrong, and passes."""
    files = _python_files()
    tests = [p for p in files if p.name.endswith("_test.py")]

    assert len(files) > 200
    assert len(tests) > 150
    assert Path(__file__) in files


class TestHoldsTests:
    def test_a_test_function_at_the_top_counts(self) -> None:
        assert holds_tests("def test_it() -> None:\n    assert True\n")

    def test_an_async_test_function_counts(self) -> None:
        assert holds_tests("async def test_it() -> None:\n    pass\n")

    def test_a_test_class_with_a_test_method_counts(self) -> None:
        assert holds_tests(
            "class TestThing:\n    def test_it(self) -> None:\n        pass\n"
        )

    def test_a_class_named_test_with_no_test_method_does_not(self) -> None:
        """The compatibility harness's models are named this way."""
        assert not holds_tests(
            "class TestBreakingResponse1:\n    message: str = 'x'\n"
        )

    def test_a_helper_whose_name_only_contains_test_does_not(self) -> None:
        assert not holds_tests(
            "def make_test_user() -> None:\n    pass\n"
            "def _test_helper() -> None:\n    pass\n"
        )

    def test_a_test_function_nested_in_another_does_not(self) -> None:
        """pytest does not collect it either."""
        assert not holds_tests(
            "def build() -> None:\n    def test_inner() -> None:\n        pass\n"
        )

    @pytest.mark.parametrize("source", ["", "X = 1\n", "import os\n"])
    def test_a_file_with_no_functions_does_not(self, source: str) -> None:
        assert not holds_tests(source)
