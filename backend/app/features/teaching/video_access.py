"""Cloud CDN signed cookies for teaching video.

The access boundary for hosted lectures. FastAPI decides *whether* a
learner may watch a module's video; this module turns that decision into
a cookie the load balancer will honour, and the edge then serves the
bytes without the request ever reaching the application.

Deliberately separate from ``storage.py``. The signing code below is the
whole authorisation mechanism — a mistake in the prefix hands a learner
every module in the bucket — so it is kept small enough to read in one
sitting and tested on its own.

Two properties are worth stating plainly, because both are load-bearing:

- **The cookie is scoped to a URL prefix, not a URL.** One grant covers
  every asset beneath ``{base}/{org_id}/{module_id}/`` — renditions,
  poster frame, captions — so the player fetches what it needs without
  a round trip per file, and the design survives a later move to
  segmented HLS where per-URL signing would be untenable.

- **Signing is arithmetic, not a network call.** An HMAC over a shared
  secret, so minting a grant needs no GCS credentials and no API call.
  That is why the backend holds no role at all on the video bucket.

HMAC-SHA1 is Cloud CDN's scheme rather than a choice made here. SHA-1's
collision weakness does not apply to an HMAC construction and HMAC-SHA1
has no practical break, but it will be flagged in review, so it is
recorded as a platform constraint.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
from datetime import datetime

# Matches storage.py's rule for the same identifiers. Kept as its own
# constant rather than imported: this module is the authorisation
# boundary, and a loosened pattern elsewhere should not silently widen
# what a cookie can be minted for.
_SAFE_MODULE_ID = re.compile(r"^[a-zA-Z0-9_-]+$")


def _b64url(raw: bytes) -> str:
    """Base64url-encode without padding, as Cloud CDN expects."""
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def build_url_prefix(base_url: str, org_id: int, module_id: str) -> str:
    """Return the URL prefix a cookie for this module should cover.

    The prefix *is* the authorisation boundary, so both components are
    validated before they reach it. A traversal here would not merely
    break a link — it would grant a learner every module in the bucket.

    Args:
        base_url: Where video is served from, without a trailing slash.
        org_id: Organisation primary key. An integer, so it is checked
            for positivity rather than against the identifier pattern,
            which would happily accept ``-1`` and ``0``.
        module_id: Question bank identifier.

    Returns:
        The prefix, with a trailing slash. Cloud CDN matches on the
        literal string, so the slash is what stops a cookie for
        ``module-1`` also covering ``module-10``.

    Raises:
        ValueError: If either component is unsafe.
    """
    if org_id <= 0:
        raise ValueError("org_id must be a positive integer")
    if not module_id or not _SAFE_MODULE_ID.match(module_id):
        raise ValueError("module_id contains unsafe characters")

    return f"{base_url.rstrip('/')}/{org_id}/{module_id}/"


def sign_cookie(
    url_prefix: str,
    expires_at: datetime,
    key_name: str,
    key_value: str,
) -> str:
    """Return a signed ``Cloud-CDN-Cookie`` value for ``url_prefix``.

    Cloud CDN's format exactly: the policy string, then the same string
    with the signature appended.

        URLPrefix=<b64url>:Expires=<unix>:KeyName=<name>:Signature=<b64url>

    Field order is part of the specification — the edge recomputes the
    HMAC over the policy as written, so reordering produces a signature
    that verifies against nothing.

    Args:
        url_prefix: What the grant covers, from :func:`build_url_prefix`.
        expires_at: When the grant lapses. Timezone-aware.
        key_name: The signed-URL key's name, so the edge knows which key
            to verify with.
        key_value: The key material, base64url, shared with the load
            balancer.

    Returns:
        The cookie value. Never log it: it is a bearer credential for
        everything beneath the prefix until it expires.
    """
    policy = (
        f"URLPrefix={_b64url(url_prefix.encode('utf-8'))}"
        f":Expires={int(expires_at.timestamp())}"
        f":KeyName={key_name}"
    )

    # The key is base64url and may have had its padding stripped, which
    # is how Cloud CDN presents it; restore it before decoding.
    padding = "=" * (-len(key_value) % 4)
    key = base64.urlsafe_b64decode(key_value + padding)

    signature = hmac.new(key, policy.encode("utf-8"), hashlib.sha1).digest()
    return f"{policy}:Signature={_b64url(signature)}"
