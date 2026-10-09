#!/usr/bin/env python3
"""Render the email previews from a pre-commit hook.

Storybook's Foundations/Emails stories show the committed renders under
``frontend/src/stories/emails/rendered/``, and
``tests/test_email_previews.py`` fails in CI when a template has changed
and they were not rendered again. That failure arrives after the push.
This runs the same render at commit time, whenever something an email is
made from is staged, so the renders go into the same commit as the
change that altered them.

It is ``just email-preview`` without the container: pre-commit runs on
the host, where the backend's Poetry environment already serves the
other hooks. The two produce the same files byte for byte.

Usage:
    python backend/scripts/render_email_previews.py

The hook in ``.pre-commit-config.yaml`` stages the folder afterwards.
"""

import sys
from pathlib import Path

# Make imports robust regardless of current working directory or how this
# script is invoked (pre-commit runs it as a bare script, not a package),
# mirroring check_api_schema_coverage.py's own bootstrap.
_HERE = Path(__file__).resolve()
_BACKEND_DIR = _HERE.parents[1]
sys.path.insert(0, str(_BACKEND_DIR))

from scripts.dump_openapi import inject_dev_defaults  # noqa: E402


def main() -> int:
    """Write every preview, and name the ones that changed.

    Returns:
        0 when the previews were written, 1 when rendering failed.
    """
    # The app's settings refuse to load without a JWT secret and database
    # passwords. A fresh checkout has no backend/.env, and nothing here
    # uses either, so placeholders stand in where the real ones are unset.
    inject_dev_defaults()

    # After the placeholders: importing the app reads the settings.
    from app.email.previews import write
    from app.paths import EMAIL_PREVIEWS_DIR

    before = _contents(EMAIL_PREVIEWS_DIR)

    try:
        written = write()
    except Exception as exc:
        # Broad on purpose: a template that does not render is what this
        # hook is most likely to meet, and the commit should stop with the
        # reason in front of whoever made it.
        print(f"✗ The emails could not be rendered: {exc}", file=sys.stderr)

        return 1

    after = _contents(EMAIL_PREVIEWS_DIR)
    changed = sorted(
        name for name in after if before.get(name) != after[name]
    ) + sorted(name for name in before if name not in after)

    if changed:
        print(f"Rendered {len(written)} email previews; these changed:")

        for name in changed:
            print(f"  {name}")
    else:
        print(f"Rendered {len(written)} email previews; none changed.")

    return 0


def _contents(directory: Path) -> dict[str, str]:
    """Every file in *directory* by name, or nothing if it is not there."""
    if not directory.is_dir():
        return {}

    return {
        path.name: path.read_text(encoding="utf-8")
        for path in directory.iterdir()
        if path.is_file()
    }


if __name__ == "__main__":
    raise SystemExit(main())
