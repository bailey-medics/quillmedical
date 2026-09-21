"""Where teaching objects live in a bucket, and nothing else.

Deliberately importable without configuration. Every function here is
pure — arguments in, a string out, no settings, no network, no database
— and this module imports nothing from :mod:`app.config`, so the Cloud
Run jobs can compute an object key without holding credentials they have
no use for.

That is not a stylistic preference. ``storage.py`` imports ``settings``
at module scope, because most of it genuinely needs a bucket name or a
signing credential. Importing *anything* from it therefore constructs
the whole ``Settings`` object, which requires ``JWT_SECRET`` and
``CORE_DB_PASSWORD`` — and the transcode job, which wants one five-line
path helper, crashed on startup demanding a JWT signing key it should
never be given:

    transcode_cli.py: from app.features.teaching.storage import ...
    storage.py:19:    from app.config import settings
    config.py:393:    ValidationError: JWT_SECRET, CORE_DB_PASSWORD

The same reasoning put ``requires_feature`` in ``app.features.gating``
rather than in ``app/features/__init__.py`` — see that package's
docstring, which names the same two settings.

``storage.py`` imports these names and re-exports them, so its own
callers are unaffected and there is one definition of each path.
"""

from __future__ import annotations

import re

#: Identifiers that may appear in an object key.
#:
#: The boundary for every path built here: these strings are
#: concatenated into a bucket key, so a ``/`` or a ``..`` would let one
#: organisation's job read or overwrite another's objects. Alphanumerics,
#: hyphens and underscores only, and no empty string.
SAFE_ID = re.compile(r"^[a-zA-Z0-9_-]+$")


def module_prefix(bank_id: str) -> str:
    """Where a module's files live: ``modules/<bank_id>/``."""
    return f"modules/{bank_id}/"


def assessment_prefix(bank_id: str) -> str:
    """Where a module's assessment lives, ``questions/<bank_id>/`` before."""
    return f"{module_prefix(bank_id)}assessment/"


def learning_prefix(module_id: str) -> str:
    """Where a module's learning content lives, ``learning/<id>/`` before."""
    return f"{module_prefix(module_id)}learning/"


def media_object_path(org_id: int, module_id: str, asset_id: str) -> str:
    """Where an uploaded asset lives in the source bucket.

    Keyed by generated id, never the uploaded filename: collisions
    become impossible, upload naming becomes irrelevant, and a filename
    carrying a patient identifier never reaches a URL.
    """
    if org_id <= 0:
        msg = f"Invalid org_id: {org_id!r}"
        raise ValueError(msg)
    if not module_id or not SAFE_ID.match(module_id):
        msg = f"Invalid module_id: {module_id!r}"
        raise ValueError(msg)
    if not asset_id or not SAFE_ID.match(asset_id):
        msg = f"Invalid asset_id: {asset_id!r}"
        raise ValueError(msg)
    return f"{org_id}/{module_id}/{asset_id}"


def caption_object_path(org_id: int, module_id: str, asset_id: str) -> str:
    """Where an asset's WebVTT lives in the processed bucket.

    The caption job writes ``{asset_id}.vtt`` beside the renditions, and
    ``_resolve_video_filename`` returns that name to the player, so this
    is the one org_unit the spelling is stated for the admin path too.

    Built on ``media_object_path`` so the same validation guards it: a
    traversal here would let a caller read or overwrite another
    organisation's captions.
    """
    return f"{media_object_path(org_id, module_id, asset_id)}.vtt"
