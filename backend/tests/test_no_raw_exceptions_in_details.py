"""No caught exception may reach the client through an HTTPException detail.

Written after auditing what a browser error report would carry. Eleven
endpoints returned ``str(e)``, or an f-string containing it, to the caller —
ten on patient-data paths, where the exception originates in EHRbase, HAPI
FHIR or the database and can carry a name, an NHS number, a request URL with
an identifier in it, or a fragment of a clinical document.

That text reached the browser, was rendered on screen by pages that show
``err.message`` directly, and would have been copied into logs by the error
reporter. A sanitiser cannot fix it: NHS numbers, dates and postcodes have
patterns, and names do not, so the only real fix is not to send it.

This reads the syntax tree rather than the text. The first version matched
lines with a regular expression and immediately flagged its own docstring,
which is a fair summary of why prose-matching is the wrong tool: it cannot
tell a rule from a mention of the rule.
"""

import ast
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parent.parent / "app"


def _python_files() -> list[Path]:
    return sorted(APP.rglob("*.py"))


class _RiskyNames(ast.NodeVisitor):
    """Names used as values, ignoring names used only as an attribute base.

    ``str(exc)`` and ``f"{exc}"`` hand over whatever the exception carries,
    which is the defect. ``exc.message`` reads a named attribute that somebody
    wrote — on the typed exceptions in ``messaging.py`` those are class
    constants with a no-argument constructor, so there is nothing to
    interpolate into them. Treating the two alike would leave no way to return
    a structured error at all, and would push people towards assigning to a
    local first, which defeats the check rather than satisfying it.
    """

    def __init__(self) -> None:
        self.names: set[str] = set()

    def visit_Attribute(self, node: ast.Attribute) -> None:
        if not isinstance(node.value, ast.Name):
            self.generic_visit(node)

    def visit_Name(self, node: ast.Name) -> None:
        self.names.add(node.id)


def _names_in(node: ast.AST) -> set[str]:
    visitor = _RiskyNames()
    visitor.visit(node)
    return visitor.names


def offending_details(tree: ast.AST) -> list[tuple[int, str]]:
    """Find HTTPException details that reference the caught exception.

    Scoped to ``except ... as <name>`` handlers, so it flags the thing that
    actually went wrong rather than banning a shape. An authored constant is
    fine, and so is an f-string interpolating a fixed vocabulary — the repo
    has several, listing valid values back to the caller. What is never fine
    is handing over whatever the database, EHRbase or HAPI FHIR happened to
    put in an exception.
    """
    found: list[tuple[int, str]] = []

    for handler in [
        n for n in ast.walk(tree) if isinstance(n, ast.ExceptHandler)
    ]:
        caught = handler.name
        if caught is None:
            continue
        for call in [n for n in ast.walk(handler) if isinstance(n, ast.Call)]:
            func = call.func
            name = getattr(func, "id", None) or getattr(func, "attr", None)
            if name != "HTTPException":
                continue
            for kw in call.keywords:
                if kw.arg == "detail" and caught in _names_in(kw.value):
                    found.append((call.lineno, caught))
    return found


def test_the_check_catches_what_it_is_meant_to() -> None:
    """A guard that cannot fail is worse than no guard at all."""
    bad_str = ast.parse(
        "try:\n    f()\nexcept Exception as e:\n"
        "    raise HTTPException(status_code=500, detail=str(e)) from e\n"
    )
    bad_interpolated = ast.parse(
        "try:\n    f()\nexcept Exception as e:\n"
        '    raise HTTPException(status_code=500, detail=f"Failed: {e}") from e\n'
    )
    good_literal = ast.parse(
        "try:\n    f()\nexcept Exception as e:\n"
        '    raise HTTPException(status_code=404, detail="Not found") from e\n'
    )
    good_vocabulary = ast.parse(
        "try:\n    f()\nexcept Exception as e:\n"
        '    raise HTTPException(detail=f"One of: {valid}") from e\n'
    )
    good_typed = ast.parse(
        "try:\n    f()\nexcept MessagingError as exc:\n"
        "    raise HTTPException(status_code=exc.status_code, "
        'detail={"message": exc.message, "error_code": exc.error_code}) from exc\n'
    )
    bad_bare = ast.parse(
        "try:\n    f()\nexcept Exception as e:\n"
        "    raise HTTPException(detail=e) from e\n"
    )

    assert offending_details(bad_str)
    assert offending_details(bad_interpolated)
    assert offending_details(bad_bare)
    assert not offending_details(good_literal)
    assert not offending_details(good_vocabulary)
    assert not offending_details(good_typed)


@pytest.mark.parametrize(
    "path", _python_files(), ids=lambda p: str(p.relative_to(APP))
)
def test_no_caught_exception_reaches_a_detail(path: Path) -> None:
    """Log the exception, send the caller a written message and a code."""
    offenders = offending_details(ast.parse(path.read_text()))

    assert not offenders, (
        f"{path.relative_to(APP)} passes caught exception text to the client. "
        "Log it with logger.exception and return an authored message plus a "
        "stable error_code instead. Lines: "
        + ", ".join(f"{line} ({name})" for line, name in offenders)
    )
