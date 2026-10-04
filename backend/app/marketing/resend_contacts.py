"""Keeping one person's entry on the Resend mailing list in step.

Newsletters are sent from Resend, not from Quill, so Resend's record of a
contact is what decides who is emailed. This module tells it what a person
chose: in the newsletter segment, opted in to or out of the newsletter
topic, and subscribed or unsubscribed as a contact to match.

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
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TypeVar
from urllib.parse import quote

import httpx

from app.config import settings
from app.models import User

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com"

#: How long to wait for Resend. Short, because one of the callers is a
#: person waiting for a page, and shorter still to connect: a connection
#: that has not opened in two seconds is not about to.
TIMEOUT = httpx.Timeout(5.0, connect=2.0)

#: The address the client connects *from*, which is how ``httpx`` is told
#: to use IPv4 only. Resend's API has two IPv6 addresses and two IPv4
#: ones, and the backend on Cloud Run has no IPv6 route out. Tried in the
#: order the resolver gives, each IPv6 address hangs for the whole connect
#: timeout before an IPv4 one is reached. On 3 October 2026, the first day
#: this ran in production, two of three saves from the Settings switch
#: took 10.5 seconds, which is two five-second connect timeouts and one
#: ordinary request; the third took one second.
IPV4_ONLY = "0.0.0.0"  # nosec B104 - a source address, not a listener


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
        transport=httpx.HTTPTransport(local_address=IPV4_ONLY),
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


# A TypeVar rather than PEP 695 type parameters, for the reason
# ``app/features/passport/serialise.py`` gives: mypy in this repository
# does not read the newer syntax.
_T = TypeVar("_T")


def _reaching_resend(  # noqa: UP047 - see the TypeVar note above
    call: Callable[[], _T],
) -> _T:
    """Make some calls to Resend, once more from the top if one stalls.

    Resend now and then takes longer than ``TIMEOUT`` to answer one
    request and is back to normal on the next: seen once from the dev
    stack on 3 October 2026 and once in production the day after, in
    about thirty calls. A save from Settings is four calls in a row, so
    one stall failed the whole save and the person was told to try again.
    A second try does that for them.

    Only a timeout is tried again. A refusal would be refused again, and
    a connection that cannot be made at all is not a stall.

    Everything passed here must be safe to run twice, which every caller
    is: each looks at what Resend holds before changing it.

    Args:
        call: The calls to make.

    Returns:
        Whatever ``call`` returns.

    Raises:
        MarketingSyncError: If Resend stalled twice, or could not be
            reached at all. The message never holds an address.
    """
    try:
        try:
            return call()
        except httpx.TimeoutException:
            return call()
    except httpx.HTTPError as exc:
        # The exception's own text may quote the URL, which holds the
        # address, so only its type is kept.
        raise MarketingSyncError(
            f"Resend could not be reached: {type(exc).__name__}"
        ) from None


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

    # Resend holds two switches for a contact and both are set. The topic
    # is the one a newsletter is sent to. The contact's own
    # ``unsubscribed`` flag is what Resend checks when a broadcast names a
    # segment and no topic, and what its Audience page shows. Setting the
    # topic alone left somebody who had refused showing as "Subscribed"
    # there, and one broadcast sent without the topic away from being
    # emailed. There is one newsletter and one choice, so the two agree.
    subscription = "opt_in" if user.marketing_emails else "opt_out"
    topics = [{"id": config.topic_id, "subscription": subscription}]
    unsubscribed = not user.marketing_emails
    contact = quote(user.email, safe="")

    def tell_resend() -> None:
        with _client(config) as client:
            found = client.get(f"/contacts/{contact}")
            if found.status_code == 404:
                _check(
                    client.post(
                        "/contacts",
                        json={
                            "email": user.email,
                            **_names(user),
                            "unsubscribed": unsubscribed,
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
                _check(
                    client.patch(
                        f"/contacts/{contact}",
                        json={"unsubscribed": unsubscribed},
                    ),
                    "setting whether the contact is unsubscribed",
                )
                # The topics go as a bare list, which is what Resend
                # takes on this route.
                _check(
                    client.patch(f"/contacts/{contact}/topics", json=topics),
                    "setting the contact's topic",
                )

    _reaching_resend(tell_resend)

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

    def read_topics() -> httpx.Response:
        with _client(config) as client:
            return client.get(f"/contacts/{contact}/topics")

    response = _reaching_resend(read_topics)
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


@dataclass(frozen=True)
class ListedContact:
    """One contact as Resend lists it: who, and its own switch."""

    email: str
    unsubscribed: bool


#: How many contacts to ask Resend for at a time. Its most.
PAGE_SIZE = 100

#: The most pages ``list_contacts`` will read. A stop, not a plan: at a
#: hundred a page this is fifty thousand contacts, and a list that long
#: wants a different job from one that reads it all into memory.
MAX_PAGES = 500


def list_contacts() -> list[ListedContact] | None:
    """Everybody in the newsletter segment, as Resend holds them.

    For the weekly check that Quill still matches Resend. Read a page at
    a time, each page starting after the last contact of the one before.

    Returns:
        The contacts, or None when the Resend settings are unset.

    Raises:
        MarketingSyncError: If Resend could not be reached or refused,
            or the list did not end within ``MAX_PAGES``.
    """
    config = _config()
    if config is None:
        return None

    contacts: list[ListedContact] = []
    after: str | None = None
    for _ in range(MAX_PAGES):
        params: dict[str, str | int] = {
            "segment_id": config.segment_id,
            "limit": PAGE_SIZE,
        }
        if after is not None:
            params["after"] = after

        def read_page(
            params: dict[str, str | int] = params,
        ) -> httpx.Response:
            with _client(config) as client:
                return client.get("/contacts", params=params)

        response = _reaching_resend(read_page)
        _check(response, "listing the contacts")
        payload = response.json()
        rows = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(rows, list):
            raise MarketingSyncError("Resend's contact list was not a list")

        last_id: str | None = None
        for row in rows:
            if not isinstance(row, dict):
                continue
            email = row.get("email")
            if isinstance(email, str) and email:
                contacts.append(
                    ListedContact(
                        email=email,
                        unsubscribed=row.get("unsubscribed") is True,
                    )
                )
            if isinstance(row.get("id"), str):
                last_id = row["id"]

        if not payload.get("has_more") or last_id is None:
            return contacts
        after = last_id

    raise MarketingSyncError(
        f"Resend's contact list did not end within {MAX_PAGES} pages"
    )


def remove_contact(email: str) -> bool:
    """Take somebody off the mailing list altogether.

    For somebody who asks for their data to be erased, which nothing
    does yet: closing an account deliberately leaves the list alone.
    Removing a contact Resend does not have is not an error.

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

    def remove() -> None:
        with _client(config) as client:
            response = client.delete(f"/contacts/{contact}")
            if response.status_code != 404:
                _check(response, "removing the contact")

    _reaching_resend(remove)
    return True
