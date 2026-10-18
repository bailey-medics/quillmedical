"""How a Cloud Run job proves who it is when it reports to the backend.

A job runs as its own service account, and the metadata server beside
it will sign an identity token for any audience the job names. The
backend checks the token's signature, audience and ``email`` in
``require_job_identity``, so the job holds no secret at all: nothing to
mount, nothing to rotate, nothing a leaked environment would give away.

Stdlib only, for the reason ``object_paths`` gives: the caption image
carries three pinned packages and ``app/``, and nothing here may want
more than that. ``urllib`` is what both jobs already use for the report
itself.
"""

from __future__ import annotations

import sys
import urllib.error
import urllib.parse
import urllib.request

#: Where a Cloud Run instance asks for a token signed for its service
#: account. The same address on every Google Cloud runtime.
METADATA_IDENTITY_URL = (
    "http://metadata.google.internal/computeMetadata/v1/instance/"
    "service-accounts/default/identity"
)


def mint_identity_token(audience: str) -> str | None:
    """A Google-signed identity token for *audience*, or ``None``.

    ``None`` means the metadata server could not be reached or refused,
    which is what happens on a laptop and in a test. The reason is
    printed to stderr, and the caller decides what a missing token
    costs: for a completion report it is a skipped report and a module
    that stays hidden, never a failed job.
    """
    query = urllib.parse.urlencode({"audience": audience})
    request = urllib.request.Request(
        f"{METADATA_IDENTITY_URL}?{query}",
        headers={"Metadata-Flavor": "Google"},
    )

    try:
        # A fixed address on the instance's own network, never a user's.
        with urllib.request.urlopen(  # nosec B310
            request, timeout=10
        ) as response:
            token: str = response.read().decode("utf-8").strip()
    except (urllib.error.URLError, OSError, ValueError) as exc:
        print(
            f"ERROR: could not mint an identity token ({exc})",
            file=sys.stderr,
        )
        return None

    if not token:
        print(
            "ERROR: the metadata server answered with an empty token",
            file=sys.stderr,
        )
        return None

    return token
