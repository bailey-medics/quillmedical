"""Keeping one person's entry on the Resend mailing list in step.

Newsletters are sent from Resend, not from Quill, so Resend's record of a
contact is what decides who is emailed. This module tells it what a person
chose: in the newsletter segment, opted in to or out of the newsletter
topic.

Somebody who opted out is still sent, as a contact opted *out*. Resend
then holds the refusal, and a later import of addresses cannot subscribe
them by accident.

The calls are made with ``httpx`` and their own key, not through the
``resend`` SDK that ``email_send.py`` uses. The SDK keeps its API key in
one module-level variable, and this needs a different key from the one
email is sent with: setting it here would race with a password reset
being sent on another thread.

Only an email address and a name are sent. Which wording somebody
answered, and when, stays in ``marketing_preference_change``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import quote

import httpx

from app.config import settings
from app.models import User

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com"

#: Seconds to wait for Resend. Short, because one of the callers is a
#: person waiting for a page.
TIMEOUT = 5.0


class MarketingSyncError(Exception):
    """Resend could not be told. The message never holds an address."""


@dataclass(frozen=True)
class _Config:
    api_key: str
    segment_id: str
    topic_id: str


def _config() -> _Config | None:
    """The Resend settings, or None when any of them is unset."""
    key = settings.RESEND_CONTACTS_API_KEY
    segment_id = settings.RESEND_NEWSLETTER_SEGMENT_ID
    topic_id = settings.RESEND_NEWSLETTER_TOPIC_ID
    if key is None or not segment_id or not topic_id:
        return None
    # Stripped for the reason ``email_send.py`` gives: a key stored with a
    # trailing newline makes the Authorization header invalid.
    return _Config(
        api_key=key.get_secret_value().strip(),
        segment_id=segment_id,
        topic_id=topic_id,
    )


def is_configured() -> bool:
    """Whether Quill has been told where the mailing list is."""
    return _config() is not None


def _client(config: _Config) -> httpx.Client:
    return httpx.Client(
        base_url=RESEND_API_URL,
        headers={"Authorization": f"Bearer {config.api_key}"},
        timeout=TIMEOUT,
    )


def _names(user: User) -> dict[str, str]:
    """First and last name for the contact, from the one full name held."""
    parts = (user.full_name or "").split()
    if not parts:
        return {}
    names = {"first_name": parts[0]}
    if len(parts) > 1:
        names["last_name"] = " ".join(parts[1:])
    return names


def _check(response: httpx.Response, doing: str) -> None:
    """Raise if Resend refused, naming the step and never the address."""
    if response.is_success:
        return
    raise MarketingSyncError(
        f"Resend refused {doing}: HTTP {response.status_code}"
    )


def sync_contact(user: User) -> bool:
    """Tell Resend what one person chose.

    Creates the contact if Resend has none for the address, and otherwise
    brings the existing one into line. Safe to repeat. On success
    ``user.marketing_synced_at`` is set; the caller's session saves it.

    Args:
        user: The person. Their ``marketing_emails`` is what is sent.

    Returns:
        True if Resend was told, False if the Resend settings are unset
        and nothing was sent.

    Raises:
        MarketingSyncError: If Resend could not be reached or refused.
    """
    config = _config()
    if config is None:
        logger.info(
            "Marketing sync skipped for user %s: Resend contact settings "
            "are not configured",
            user.id,
        )
        return False

    subscription = "opt_in" if user.marketing_emails else "opt_out"
    topics = [{"id": config.topic_id, "subscription": subscription}]
    contact = quote(user.email, safe="")

    try:
        with _client(config) as client:
            found = client.get(f"/contacts/{contact}")
            if found.status_code == 404:
                _check(
                    client.post(
                        "/contacts",
                        json={
                            "email": user.email,
                            **_names(user),
                            "segments": [{"id": config.segment_id}],
                            "topics": topics,
                        },
                    ),
                    "creating the contact",
                )
            else:
                _check(found, "looking the contact up")
                # Already known to Resend, perhaps from the public site's
                # signup form. Put it in the segment and set the topic;
                # anything else about it is left as it is.
                _check(
                    client.post(
                        f"/contacts/{contact}/segments/{config.segment_id}",
                        json={},
                    ),
                    "adding the contact to the segment",
                )
                # The topics go as a bare list, which is what Resend
                # takes on this route.
                _check(
                    client.patch(f"/contacts/{contact}/topics", json=topics),
                    "setting the contact's topic",
                )
    except httpx.HTTPError as exc:
        # The exception's own text may quote the URL, which holds the
        # address, so only its type is kept.
        raise MarketingSyncError(
            f"Resend could not be reached: {type(exc).__name__}"
        ) from None

    user.marketing_synced_at = datetime.now(UTC)
    return True


def topic_subscription(email: str) -> str | None:
    """What Resend holds for somebody on the newsletter topic.

    Asked when Resend says a contact changed, because that message does
    not say what the contact's topics now are.

    Args:
        email: The contact's address.

    Returns:
        ``"opt_in"`` or ``"opt_out"``, or None when Resend holds no answer
        for the topic, has no such contact, or the settings are unset.

    Raises:
        MarketingSyncError: If Resend could not be reached or refused.
    """
    config = _config()
    if config is None:
        return None

    contact = quote(email, safe="")
    try:
        with _client(config) as client:
            response = client.get(f"/contacts/{contact}/topics")
    except httpx.HTTPError as exc:
        raise MarketingSyncError(
            f"Resend could not be reached: {type(exc).__name__}"
        ) from None
    if response.status_code == 404:
        return None
    _check(response, "reading the contact's topics")

    payload = response.json()
    topics = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(topics, list):
        return None
    for topic in topics:
        if isinstance(topic, dict) and topic.get("id") == config.topic_id:
            subscription = topic.get("subscription")
            if subscription in ("opt_in", "opt_out"):
                return str(subscription)
    return None


def remove_contact(email: str) -> bool:
    """Take somebody off the mailing list altogether.

    For an account that is being closed. Removing a contact Resend does
    not have is not an error.

    Args:
        email: The address to remove.

    Returns:
        True if Resend was asked, False if the settings are unset.

    Raises:
        MarketingSyncError: If Resend could not be reached or refused.
    """
    config = _config()
    if config is None:
        return False

    contact = quote(email, safe="")
    try:
        with _client(config) as client:
            response = client.delete(f"/contacts/{contact}")
            if response.status_code != 404:
                _check(response, "removing the contact")
    except httpx.HTTPError as exc:
        raise MarketingSyncError(
            f"Resend could not be reached: {type(exc).__name__}"
        ) from None
    return True
