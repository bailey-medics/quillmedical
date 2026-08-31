"""Guard: importing ``app.features`` must stay cheap.

``app.features.__init__`` used to define ``requires_feature``, so importing
anything under ``app.features`` pulled in FastAPI, SQLAlchemy, ``app.models``,
``app.db`` and ``app.config`` — and ``Settings`` requires ``JWT_SECRET`` and
``CORE_DB_PASSWORD``.  That made the package unusable for tooling that only
needs to read YAML, which is why ``requires_feature`` now lives in
``app.features.gating``.

These tests run the import in a subprocess with a stripped environment: if
anything in the chain reaches ``app.config``, the missing secrets make it fail
loudly rather than silently passing because the test runner already had them
set.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

# Modules that must NOT be pulled in by a bare ``app.features`` import.
FORBIDDEN = ("fastapi", "sqlalchemy", "app.models", "app.db", "app.config")

_BACKEND_ROOT = Path(__file__).resolve().parent.parent


def _import_in_clean_subprocess(
    module: str,
) -> subprocess.CompletedProcess[str]:
    """Import *module* with no app secrets in the environment."""
    script = (
        "import sys\n"
        f"import {module}\n"
        f"leaked = [m for m in {FORBIDDEN!r} if m in sys.modules]\n"
        "print('LEAKED:' + ','.join(leaked))\n"
    )
    # PATH only — deliberately no JWT_SECRET or CORE_DB_PASSWORD.
    env = {
        "PATH": os.environ.get("PATH", ""),
        "PYTHONPATH": str(_BACKEND_ROOT),
        "PYTHONDONTWRITEBYTECODE": "1",
    }
    return subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
        env=env,
        cwd=str(_BACKEND_ROOT),
        timeout=60,
    )


@pytest.mark.parametrize(
    "module",
    [
        "app.features",
        "app.features.teaching",
        "app.features.teaching.content",
        "app.features.teaching.content.check_version_lock",
    ],
)
def test_import_needs_no_secrets(module: str) -> None:
    """The import must succeed without JWT_SECRET or CORE_DB_PASSWORD."""
    result = _import_in_clean_subprocess(module)
    assert result.returncode == 0, (
        f"importing {module} failed without app secrets — something in the "
        f"chain reached app.config:\n{result.stderr}"
    )


@pytest.mark.parametrize(
    "module",
    [
        "app.features",
        "app.features.teaching",
        "app.features.teaching.content",
        "app.features.teaching.content.check_version_lock",
    ],
)
def test_import_pulls_in_nothing_heavy(module: str) -> None:
    """The import must not drag in FastAPI, SQLAlchemy or app internals."""
    result = _import_in_clean_subprocess(module)
    assert result.returncode == 0, result.stderr
    line = next(
        ln for ln in result.stdout.splitlines() if ln.startswith("LEAKED:")
    )
    leaked = [m for m in line.removeprefix("LEAKED:").split(",") if m]
    assert not leaked, (
        f"importing {module} pulled in {leaked}. Keep the __init__.py files in "
        "the app.features chain docstring-only — see app/features/gating.py."
    )


def test_requires_feature_still_importable_from_gating() -> None:
    """The dependency itself is unchanged, just relocated."""
    from app.features.gating import requires_feature

    assert callable(requires_feature)
    assert callable(requires_feature("teaching"))
