# cspell:ignore svix whsec
"""Marketing email routes.

The Settings switch that changes a person's own preference; the two
routes behind the unsubscribe link in a newsletter Quill sends, which
need no login; and the webhook Resend calls when a contact changes.
Somebody who clicks "unsubscribe" in a newsletter Resend sent changes
their entry in Resend, and without the webhook Quill would go on showing
their Settings switch as on.

See ``docs/docs/plans/2026-10-03-marketing-opt-out-plan.md``, and Phase 4
of ``docs/docs/plans/2026-10-06-amazon-ses-email-plan.md`` for the link.
"""

import logging
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import resend
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_core_db
from app.deps import DEP_CURRENT_USER, get_current_user
from app.email_send import mask_email
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
    MarketingUnsubscribeOut,
    ResendWebhookOut,
)
from app.security import verify_marketing_unsubscribe_token

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

#: The token in an unsubscribe link. Long enough for any real one, and
#: bounded so that a request cannot hand the verifier megabytes to hash.
_UNSUBSCRIBE_TOKEN = Query(min_length=1, max_length=512)


def _unsubscribe_user(token: str, db: Session) -> User:
    """Whose unsubscribe link this is.

    The signature is the whole of these routes' authentication: there is
    no session and no CSRF token, because the person may be signed out,
    or may be a mailbox pressing the link for them.

    Args:
        token: The token from the link.
        db: Database session.

    Returns:
        The person the link was made for.

    Raises:
        HTTPException: 404 for a bad signature and for an account that
            is gone, alike, so the reply says nothing about which.
    """
    user_id = verify_marketing_unsubscribe_token(token)
    user = db.get(User, user_id) if user_id is not None else None
    if user is None:
        raise HTTPException(status_code=404, detail="Not found.")
    return user


def _is_json(request: Request) -> bool:
    """Whether a request says its body is JSON."""
    content_type = request.headers.get("content-type", "")
    return content_type.split(";")[0].strip().lower() == "application/json"


def _wanted_by_link(request: Request, raw: bytes) -> bool:
    """What a ``POST`` to the unsubscribe link asks for.

    Two callers. Quill's own unsubscribe page sends JSON saying which way
    to set the preference, since the page can also turn news back on. A
    mailbox doing a one-click unsubscribe (RFC 8058) sends a form body of
    ``List-Unsubscribe=One-Click``, and means off.

    Anything that is not JSON is read as that one-click: the link is
    already proven by its signature, and off is the safe way to be wrong
    about an unsubscribe.

    Args:
        request: The request, for its content type.
        raw: The body as sent.

    Returns:
        Whether the person wants marketing email.

    Raises:
        HTTPException: 422 if the body claims to be JSON and is not the
            shape the page sends.
    """
    if not _is_json(request):
        return False
    try:
        payload = MarketingPreferenceIn.model_validate_json(raw)
    except ValidationError:
        raise HTTPException(
            status_code=422, detail="Invalid request body."
        ) from None
    return payload.wants_marketing


# Public and without a CSRF token on purpose, both of them: see
# ``_unsubscribe_user``.
@router.get("/unsubscribe", response_model=MarketingUnsubscribeOut)
@limiter.limit("60/minute")
def read_unsubscribe_link(
    request: Request,
    token: str = _UNSUBSCRIBE_TOKEN,
    db: Session = _DEP_SESSION,
) -> MarketingUnsubscribeOut:
    """Say whose unsubscribe link this is, and what they now receive.

    For the unsubscribe page, which shows it before anything is changed.

    Args:
        request: The request, for the rate limiter.
        token: The token from the link.
        db: Database session.

    Returns:
        The address, mostly hidden, and the preference as it stands.

    Raises:
        HTTPException: 404 if the link is not a real one.
    """
    user = _unsubscribe_user(token, db)
    return MarketingUnsubscribeOut(
        email=mask_email(user.email),
        marketing_emails=user.marketing_emails,
    )


@router.post("/unsubscribe", response_model=MarketingUnsubscribeOut)
@limiter.limit("60/minute")
def use_unsubscribe_link(
    request: Request,
    token: str = _UNSUBSCRIBE_TOKEN,
    raw: bytes = _DEP_RAW_BODY,
    db: Session = _DEP_SESSION,
) -> MarketingUnsubscribeOut:
    """Change somebody's marketing preference from their unsubscribe link.

    Never fails because Resend cannot be reached. The Settings switch
    refuses an opt-out Resend has not heard, because Resend is what
    sends; this link only exists in a newsletter Quill sent itself, where
    Quill's own record is what stops the next one. Resend is still told
    while it holds a list, and a failure is left for the retry.

    Args:
        request: The request, for its content type and the rate limiter.
        token: The token from the link.
        raw: The body as sent.
        db: Database session.

    Returns:
        The address, mostly hidden, and the preference as it now stands.

    Raises:
        HTTPException: 404 if the link is not a real one, 422 if a JSON
            body is not the shape the page sends.
    """
    user = _unsubscribe_user(token, db)
    wants = _wanted_by_link(request, raw)
    changed = set_marketing_preference(
        db, user, wants=wants, source="unsubscribe_link"
    )
    if changed and user.email_verified:
        try:
            sync_contact(user)
        except MarketingSyncError as exc:
            logger.warning(
                "Marketing sync failed for user %s after their "
                "unsubscribe link was used: %s",
                user.id,
                exc,
            )
    return MarketingUnsubscribeOut(
        email=mask_email(user.email),
        marketing_emails=user.marketing_emails,
    )


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
