import argparse
import json
import os
import secrets
import sys
from pathlib import Path

# Make imports robust regardless of current working directory. Ensure the
# repository root and the backend package directory are on sys.path before
# importing the FastAPI app.
HERE = Path(__file__).resolve()
# parents: [0]=backend/scripts, [1]=backend, [2]=repo root
REPO_ROOT = HERE.parents[2]
BACKEND_DIR = HERE.parents[1]

# Prepend to sys.path so these entries are found first.
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(BACKEND_DIR))


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Dump the FastAPI app OpenAPI JSON to "
            "docs/docs/swagger/openapi.json"
        )
    )
    parser.add_argument(
        "--dev",
        action="store_true",
        help=(
            "Allow dev fallback values for JWT_SECRET and DATABASE_URL "
            "(local use only)"
        ),
    )
    args = parser.parse_args()

    # If requested, inject temporary dev environment values to allow importing
    # the app when running locally without a full environment.
    if args.dev:
        if not os.environ.get("JWT_SECRET"):
            tmp = secrets.token_hex(32)
            os.environ["JWT_SECRET"] = tmp
            print(
                "(export_openapi) WARNING: JWT_SECRET not set; "
                "using temporary dev secret for export"
            )
        if not os.environ.get("DATABASE_URL"):
            os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
            print(
                "(export_openapi) WARNING: DATABASE_URL not set; "
                "using in-memory SQLite for export"
            )
    # Now import the FastAPI app; do this after any env injection so
    # pydantic Settings pick up the temporary values when run with --dev.
    try:
        from app.main import app
    except Exception:  # pragma: no cover - helpful runtime diagnostics
        print("Failed to import FastAPI app for OpenAPI export.")
        print("sys.path contains:")
        for p in sys.path[:10]:
            print("  ", p)
        # Re-raise the original exception so the caller sees the traceback
        raise
    out = REPO_ROOT / "docs" / "docs" / "swagger" / "openapi.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    spec = app.openapi()
    out.write_text(json.dumps(spec, indent=2))
    print(f"✅ Wrote {out.resolve()}")


if __name__ == "__main__":
    main()
