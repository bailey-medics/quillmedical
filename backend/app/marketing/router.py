# cspell:ignore svix whsec
"""Marketing email routes.

Two: the Settings switch that changes a person's own preference, and the
webhook Resend calls when a contact changes. Somebody who clicks
"unsubscribe" in a newsletter changes their entry in Resend, and without
the webhook Quill would go on showing their Settings switch as on.

See ``docs/docs/plans/2026-10-03-marketing-opt-out-plan.md``.
"""

import logging
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import resend
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_core_db
from app.deps import DEP_CURRENT_USER, get_current_user
from app.marketing.preferences import (
    MARKETING_WORDING_VERSION,
    set_marketing_preference,
)
from app.marketing.resend_contacts import (
    MarketingSyncError,
    is_configured,
    sync_contact,
    topic_subscription,
)
from app.models import User
from app.rate_limit import limiter
from app.schemas.marketing import (
    MarketingPreferenceIn,
    MarketingPreferenceOut,
    ResendWebhookOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/marketing", tags=["marketing"])

#: How long after Quill tells Resend something a "contact changed" event
#: is taken to be Resend repeating it back. Found against the real
#: service on 3 October 2026: a topic read for about a second after a
#: write still returns the old value. An echo arriving in that second
#: would be read as the person changing their mind, and would undo the
#: choice they had just made.
ECHO_WINDOW = timedelta(seconds=60)

#: How long to wait before asking Resend a second time, when its first
#: answer says nothing changed. The same lag, from the other side: the
#: event for an unsubscribe can arrive before a read shows it.
SETTLE_SECONDS = 2.0

_DEP_SESSION = Depends(get_core_db)


def _require_csrf(request: Request, db: Session = _DEP_SESSION) -> None:
    """Check the CSRF token, borrowing ``main``'s implementation.

    ``main`` imports this router, so importing ``require_csrf`` at module
    level would be a cycle. The feedback and org_units routers do the same.
    """
    from app.main import require_csrf

    require_csrf(request, get_current_user(request, db))


@router.put(
    "/preference",
    response_model=MarketingPreferenceOut,
    dependencies=[Depends(_require_csrf)],
)
@limiter.limit("20/minute")
def set_my_marketing_preference(
    request: Request,
    payload: MarketingPreferenceIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> MarketingPreferenceOut:
    """Change whether the signed-in person is sent news and updates.

    Newsletters are sent from Resend, so an opt-out that only reached
    this database would stop nothing. Opting out is therefore not done
    until Resend has been told: if it cannot be, the request fails, the
    change is rolled back and the person is asked to try again. Opting in
    can wait for the retry, because a late opt-in costs nothing.

    An address not yet verified is never on the list, so there is nothing
    to tell Resend until it is.

    Args:
        request: The request, for the rate limiter.
        payload: The new answer.
        current_user: The signed-in person.
        db: Database session.

    Returns:
        The preference as it now stands.

    Raises:
        HTTPException: 502 if an opt-out could not reach Resend.
    """
    changed = set_marketing_preference(
        db,
        current_user,
        wants=payload.wants_marketing,
        source="settings",
        wording_version=MARKETING_WORDING_VERSION,
    )

    if changed and current_user.email_verified:
        try:
            sync_contact(current_user)
        except MarketingSyncError as exc:
            if payload.wants_marketing:
                # Saved anyway and left for the retry: nobody was failed.
                logger.warning(
                    "Marketing sync failed for user %s: %s",
                    current_user.id,
                    exc,
                )
            else:
                # The person is about to be told it did not work, so this
                # is an error and says why. The alert on backend errors
                # quotes the message; logged as a warning, the only
                # error-level entry was Cloud Run's own record of the 502,
                # which has no message, and the alert read "(null)".
                logger.error(
                    "Could not tell Resend that user %s opted out of "
                    "marketing, so the change was refused: %s",
                    current_user.id,
                    exc,
                )
                raise HTTPException(
                    status_code=502,
                    detail=(
                        "We could not update your email preferences. "
                        "Please try again."
                    ),
                ) from None

    return MarketingPreferenceOut(
        marketing_emails=current_user.marketing_emails
    )


async def _raw_body(request: Request) -> bytes:
    """The request body exactly as sent, which is what the signature covers."""
    return await request.body()


_DEP_RAW_BODY = Depends(_raw_body)


def _verified_event(request: Request, raw: bytes) -> dict[str, Any]:
    """Return the webhook's event once its signature has been checked.

    Nothing in the body is read before this passes. The check is Resend's
    own (HMAC-SHA256 over the id, the timestamp and the body, with a five
    minute window against replays) and needs no API key.

    Args:
        request: The request, for its signature headers.
        raw: The body as sent.

    Returns:
        The parsed event.

    Raises:
        HTTPException: 503 if no signing secret is configured, 401 if the
            signature does not match.
    """
    secret = settings.RESEND_WEBHOOK_SECRET
    if secret is None:
        raise HTTPException(
            status_code=503, detail="Webhook is not configured."
        )

    try:
        event = resend.Webhooks.verify(
            {
                "payload": raw.decode("utf-8"),
                "headers": {
                    "id": request.headers.get("svix-id", ""),
                    "timestamp": request.headers.get("svix-timestamp", ""),
                    "signature": request.headers.get("svix-signature", ""),
                },
                "webhook_secret": secret.get_secret_value().strip(),
            }
        )
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(
            status_code=401, detail="Invalid signature."
        ) from None
    return dict(event)


def _is_echo(user: User, event_type: str, data: dict[str, Any]) -> bool:
    """Whether an event is Resend repeating what Quill just told it.

    Args:
        user: The person the event is about.
        event_type: The event's type.
        data: The event's contact.

    Returns:
        True for a ``contact.updated`` soon after Quill's own sync. A
        deletion is never an echo: Quill does not delete a contact it has
        just synced. Nor is a contact marked unsubscribed, which needs no
        second look: it means "no" whoever set it, Quill included, and
        acting on it when Quill already holds "no" changes nothing.
    """
    if event_type != "contact.updated" or data.get("unsubscribed") is True:
        return False
    synced_at = user.marketing_synced_at
    if synced_at is None:
        return False
    if synced_at.tzinfo is None:
        synced_at = synced_at.replace(tzinfo=UTC)
    return datetime.now(UTC) - synced_at < ECHO_WINDOW


def _wants_marketing(
    event_type: str, data: dict[str, Any], current: bool
) -> bool | None:
    """What an event says about whether the contact wants news.

    Args:
        event_type: ``contact.updated`` or ``contact.deleted``.
        data: The event's contact.
        current: What Quill holds for them now.

    Returns:
        True or False, or None when the event settles nothing.

    Raises:
        MarketingSyncError: If Resend had to be asked and could not be.
    """
    if event_type == "contact.deleted":
        return False
    if data.get("unsubscribed") is True:
        return False
    if not is_configured():
        return None

    # The event carries the contact, not its topics, so ask. Resend said
    # something changed; if its answer is what Quill already holds, the
    # read may be behind the write, so wait and ask once more.
    email = str(data.get("email", ""))
    subscription = topic_subscription(email)
    if subscription is not None and (subscription == "opt_in") == current:
        time.sleep(SETTLE_SECONDS)
        subscription = topic_subscription(email)
    if subscription is None:
        return None
    return subscription == "opt_in"


# Public and without a CSRF token on purpose: it is called by Resend, not
# by a browser with a session. The signature is what authenticates it.
@router.post("/resend-webhook", response_model=ResendWebhookOut)
@limiter.limit("120/minute")
def resend_webhook(
    request: Request,
    raw: bytes = _DEP_RAW_BODY,
    db: Session = _DEP_SESSION,
) -> ResendWebhookOut:
    """Take a contact change from Resend and record it against the user.

    Args:
        request: The request, for its signature headers.
        raw: The body as sent.
        db: Database session.

    Returns:
        Whether a preference changed, already matched, or the event was
        not one this route acts on.

    Raises:
        HTTPException: 503 with no signing secret, 401 on a bad signature,
            502 if Resend had to be asked about the contact and could not
            be, so that Resend sends the event again later.
    """
    event = _verified_event(request, raw)

    event_type = event.get("type")
    data = event.get("data")
    if event_type not in ("contact.updated", "contact.deleted") or not (
        isinstance(data, dict)
    ):
        return ResendWebhookOut(status="ignored")

    email = data.get("email")
    if not isinstance(email, str) or not email:
        return ResendWebhookOut(status="ignored")

    # An address with no account is somebody who joined the list from the
    # public site. Nothing of theirs is held here.
    user = db.scalar(
        select(User).where(func.lower(User.email) == email.lower())
    )
    if user is None:
        return ResendWebhookOut(status="ignored")

    if _is_echo(user, str(event_type), data):
        return ResendWebhookOut(status="ignored")

    try:
        wants = _wants_marketing(str(event_type), data, user.marketing_emails)
    except MarketingSyncError as exc:
        logger.warning(
            "Resend webhook could not read topics for user %s: %s",
            user.id,
            exc,
        )
        raise HTTPException(
            status_code=502, detail="Could not confirm with Resend."
        ) from None
    if wants is None:
        return ResendWebhookOut(status="ignored")

    changed = set_marketing_preference(db, user, wants=wants, source="resend")
    # Resend is where the answer came from, so it does not need telling.
    # A deleted contact is the exception: the retry puts it back, opted
    # out, so that Resend goes on holding the refusal.
    if event_type == "contact.updated":
        user.marketing_synced_at = datetime.now(UTC)
    else:
        user.marketing_synced_at = None

    return ResendWebhookOut(status="updated" if changed else "unchanged")
