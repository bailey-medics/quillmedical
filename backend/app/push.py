"""Web Push notification subscription management.

This module handles push notification subscriptions from client browsers
using the Web Push protocol (RFC 8030). Subscriptions are persisted to
PostgreSQL so they survive container restarts and deployments.

Example:
    Client subscribes:
    POST /push/subscribe
    {"endpoint": "https://...", "keys": {"p256dh": "...", "auth": "..."}}

The endpoint is an address the browser was given by its push service,
and the server later sends each notification to it. So it is checked
here, on the way in: nothing is stored that the sender would then call
without question.
"""

import logging
import re
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_core_db
from app.deps import DEP_REQUIRE_CSRF
from app.models import PushSubscription as PushSubscriptionModel
from app.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/push", tags=["push"])

#: The push services browsers use. Chrome, Edge on Android, Opera, Brave
#: and Samsung Internet all go through Google's; Firefox through
#: Mozilla's. An exact host, since each service has only the one.
PUSH_HOSTS: frozenset[str] = frozenset(
    {
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
    }
)

#: Services that hand out one of many hosts under a domain of their own:
#: Safari under Apple's, Edge on Windows under Microsoft's. The leading
#: dot matters: it is what stops `web.push.apple.com.example` matching.
PUSH_HOST_SUFFIXES: tuple[str, ...] = (
    ".push.apple.com",
    ".notify.windows.com",
)

#: Longer than any endpoint a push service issues, and short enough that
#: nobody can store a book in the column.
MAX_ENDPOINT_LENGTH = 2000


#: A host name and nothing else: letters, digits and hyphens in parts
#: joined by dots. Anything outside this is refused before the name is
#: compared with the lists above, because the check here and the client
#: that later sends the notification must agree on where the host ends,
#: and they parse an address differently. A backslash is the known case:
#: `https://example.com\.push.apple.com/` reads here as one host ending
#: in Apple's domain, and to the sender as `example.com`.
_HOST_NAME = re.compile(r"[a-z0-9-]+(\.[a-z0-9-]+)+")

#: What an address may be written with: the characters RFC 3986 allows,
#: less the backslash it never did. No spaces, no control characters,
#: nothing outside ASCII.
_ADDRESS = re.compile(r"[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+")


def is_push_host(host: str) -> bool:
    """Whether a host belongs to a push service a browser would use."""
    host = host.lower()

    if not _HOST_NAME.fullmatch(host):
        return False

    return host in PUSH_HOSTS or host.endswith(PUSH_HOST_SUFFIXES)


class PushKeys(BaseModel):
    """Encryption keys for Web Push messages.

    Attributes:
        p256dh: Public key for message encryption (Base64).
        auth: Authentication secret for message encryption (Base64).
    """

    model_config = ConfigDict(extra="forbid")

    #: A P-256 public key, 65 bytes, is 87 characters of URL-safe base64;
    #: the secret, 16 bytes, is 22. The limits leave room for padding
    #: and nothing more.
    p256dh: str = Field(
        min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_-]+=*$"
    )
    auth: str = Field(
        min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+=*$"
    )


class PushSubscriptionIn(BaseModel):
    """Web Push subscription from a client browser.

    Attributes:
        endpoint: Push service endpoint URL (browser-specific).
        expirationTime: Optional subscription expiry timestamp.
        keys: Encryption keys for secure message delivery.
    """

    model_config = ConfigDict(extra="forbid")

    endpoint: str = Field(min_length=1, max_length=MAX_ENDPOINT_LENGTH)
    expirationTime: int | None = None
    keys: PushKeys

    @field_validator("endpoint")
    @classmethod
    def _endpoint_is_a_push_service(cls, value: str) -> str:
        """Refuse an address that is not a push service's.

        The sender calls whatever is stored, so a subscription naming
        any other address would have this server make a request of the
        caller's choosing. Only the host is logged on a refusal, never
        the address: the rest of it identifies one browser. A real
        browser refused here means a service has a new host to add
        above.
        """
        if not _ADDRESS.fullmatch(value):
            logger.warning("Push subscription refused: not a plain address")

            raise ValueError("endpoint is not the address of a push service")

        parts = urlsplit(value)
        host = parts.hostname or ""

        try:
            port = parts.port
        except ValueError:
            port = -1

        if (
            parts.scheme != "https"
            or not is_push_host(host)
            or port not in (None, 443)
            or parts.username is not None
            or parts.password is not None
        ):
            logger.warning(
                "Push subscription refused: scheme=%s host=%s",
                parts.scheme[:10],
                host[:100],
            )

            raise ValueError("endpoint is not the address of a push service")

        return value


class SubscribeOut(BaseModel):
    """Result of registering a push subscription.

    Attributes:
        ok: Whether the subscription was registered successfully.
        count: Total number of subscriptions for this user.
    """

    ok: bool
    count: int


@router.post("/subscribe", response_model=SubscribeOut)
def subscribe(
    sub: PushSubscriptionIn,
    current_user: User = DEP_REQUIRE_CSRF,
    db: Session = Depends(get_core_db),
) -> SubscribeOut:
    """Register a new push notification subscription.

    Requires authentication via access_token cookie.
    Upserts by (user_id, endpoint) to prevent duplicates.

    Args:
        sub: Push subscription from browser's Push API.
        current_user: Authenticated user (injected via DEP_CURRENT_USER override).
        db: Database session.

    Returns:
        dict: Status with ok=True and total subscription count for user.

    Raises:
        HTTPException: 401 if not authenticated.
    """
    # Check if subscription already exists for this user + endpoint
    existing = db.scalar(
        select(PushSubscriptionModel).where(
            PushSubscriptionModel.user_id == current_user.id,
            PushSubscriptionModel.endpoint == sub.endpoint,
        )
    )

    if existing:
        # Update keys in case they changed
        existing.keys_p256dh = sub.keys.p256dh  # gitleaks:allow
        existing.keys_auth = sub.keys.auth
    else:
        db.add(
            PushSubscriptionModel(
                user_id=current_user.id,
                endpoint=sub.endpoint,
                keys_p256dh=sub.keys.p256dh,
                keys_auth=sub.keys.auth,
            )
        )

    db.flush()

    count = db.scalar(
        select(func.count(PushSubscriptionModel.id)).where(
            PushSubscriptionModel.user_id == current_user.id
        )
    )

    return SubscribeOut(ok=True, count=count or 0)
