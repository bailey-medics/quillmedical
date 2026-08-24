"""Filesystem layout constants shared across the backend.

Resolves paths relative to this file rather than the current working
directory, so they're correct regardless of where the process is launched
from.

Mirrors the same relative depth in both environments: locally,
`backend/app/paths.py` sits three levels below the repo root; in the
container (Dockerfile COPY), `backend/app` is copied to `/app/app`, and
`shared/` and `api-compatibility/` are copied to `/shared` and
`/api-compatibility` respectively — so three `.parent`s lands on the
matching root in both cases.
"""

from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
SHARED_DIR = PROJECT_ROOT / "shared"
API_COMPATIBILITY_DIR = PROJECT_ROOT / "api-compatibility"
