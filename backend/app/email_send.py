"""Email sending module.

Uses Resend (https://resend.com) to deliver transactional email.
When ``EMAIL_DRY_RUN`` is True (the default in development), emails
are logged to stdout instead of being sent.
"""

import logging
import threading
import time
from typing import TypedDict

import resend

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rate limiting: max emails per recipient per window
# ---------------------------------------------------------------------------
_EMAIL_MAX_PER_WINDOW = 10  # max emails per recipient
_EMAIL_WINDOW_SECONDS = 3600  # 1 hour

_rate_lock = threading.Lock()
_rate_log: dict[str, list[float]] = {}


class EmailRateLimitError(Exception):
    """Raised when an email send exceeds the rate limit."""

    pass


class EmailNotAllowedError(Exception):
    """Raised when an allow-list is set and the recipient is not on it."""

    pass


def _check_allowed(recipient: str) -> None:
    """Refuse an address a development machine may not write to.

    ``EMAIL_ALLOWED_RECIPIENTS`` is empty in production, which allows
    everybody: the people this application mails are its users, and no
    list could name them. It is set in a development ``.env`` instead,
    where sending is real but only one person's addresses should ever
    be reachable.

    **Refused loudly rather than dropped quietly.** A silent skip is the
    failure mode this exists to prevent, because it looks exactly like a
    send that worked: the tester waits for mail that was never going to
    arrive and debugs the wrong thing. An exception names the address and
    the setting that stopped it.

    Args:
        recipient: Email address to check.

    Raises:
        EmailNotAllowedError: If a list is set and the address is not on
            it.
    """
    raw = settings.EMAIL_ALLOWED_RECIPIENTS

    # Parsed here rather than read from a property on Settings, because
    # this module's tests replace `settings` with a mock and every
    # attribute of one is truthy. A mock would switch the allow-list on
    # and refuse every address, turning an unrelated test red for a
    # reason nothing in it mentions.
    if not isinstance(raw, str) or not raw.strip():
        return

    allowed = frozenset(
        part.strip().lower() for part in raw.split(",") if part.strip()
    )

    if not allowed:
        return

    if recipient.strip().lower() in allowed:
        return

    logger.warning(
        "Email refused: recipient=%s is not in EMAIL_ALLOWED_RECIPIENTS",
        recipient,
    )
    raise EmailNotAllowedError(
        f"Refusing to email {recipient}: not in "
        "EMAIL_ALLOWED_RECIPIENTS. Add it there to send to this "
        "address from this environment."
    )


def _check_rate_limit(recipient: str) -> None:
    """Refuse a recipient who has had their hourly allowance.

    **Counts what was sent, never what was attempted.** The allowance
    exists to stop somebody being mailed too often, and an email that
    never left the process has not mailed them. Counting attempts meant
    a mail outage spent the budget: every retry was refused delivery and
    charged for anyway, so ten tries against an unreachable mail server
    locked the address for an hour having sent nothing at all.

    Recording is therefore :func:`_record_send`, called after the send
    returns.

    Args:
        recipient: Email address to check.

    Raises:
        EmailRateLimitError: If the recipient has exceeded the limit.
    """
    now = time.time()
    window_start = now - _EMAIL_WINDOW_SECONDS

    with _rate_lock:
        timestamps = _rate_log.get(recipient, [])
        # Prune expired entries
        timestamps = [t for t in timestamps if t > window_start]
        _rate_log[recipient] = timestamps

        if len(timestamps) >= _EMAIL_MAX_PER_WINDOW:
            logger.warning(
                "Email rate limit exceeded for recipient=%s "
                "(%d emails in last %d seconds)",
                recipient,
                len(timestamps),
                _EMAIL_WINDOW_SECONDS,
            )
            raise EmailRateLimitError(
                f"Rate limit exceeded: max {_EMAIL_MAX_PER_WINDOW} "
                f"emails per {_EMAIL_WINDOW_SECONDS}s for {recipient}"
            )


def _record_send(recipient: str) -> None:
    """Charge one email to a recipient's allowance.

    Called only once a send has succeeded, so a failure costs nothing.
    A dry run counts: it is a send that did everything but leave the
    machine, and letting it run free would mean the limit went untested
    everywhere it is easiest to test.

    Args:
        recipient: Email address that was sent to.
    """
    now = time.time()
    window_start = now - _EMAIL_WINDOW_SECONDS

    with _rate_lock:
        timestamps = [
            t for t in _rate_log.get(recipient, []) if t > window_start
        ]
        timestamps.append(now)
        _rate_log[recipient] = timestamps


class Attachment(TypedDict):
    """A file to attach to an outgoing email."""

    filename: str
    content: bytes


def send_email(
    *,
    to: str,
    subject: str,
    html_body: str,
    attachments: list[Attachment] | None = None,
) -> None:
    """Send a single email, or log it when in dry-run mode.

    Args:
        to: Recipient email address.
        subject: Email subject line.
        html_body: HTML content of the email body.
        attachments: Optional list of file attachments.

    Raises:
        EmailRateLimitError: If the recipient has exceeded the hourly limit.
        EmailNotAllowedError: If an allow-list is set and the recipient is
            not on it.
    """
    _check_allowed(to)
    _check_rate_limit(to)

    attachment_names = [a["filename"] for a in (attachments or [])]

    if settings.EMAIL_DRY_RUN:
        logger.info(
            "EMAIL DRY RUN — to=%s subject=%r attachments=%s",
            to,
            subject,
            attachment_names,
        )
        _record_send(to)
        return

    api_key = settings.RESEND_API_KEY
    if not api_key:
        logger.error("Cannot send email: RESEND_API_KEY is not configured")
        return

    resend.api_key = api_key.get_secret_value()

    resend_attachments: list[resend.Attachment | resend.RemoteAttachment] = [
        resend.Attachment(
            filename=att["filename"],
            content=list(att["content"]),
        )
        for att in (attachments or [])
    ]

    params: resend.Emails.SendParams = {
        "from": settings.EMAIL_FROM,
        "to": [to],
        "subject": subject,
        "html": html_body,
    }
    if resend_attachments:
        params["attachments"] = resend_attachments

    resend.Emails.send(params)

    _record_send(to)

    logger.info(
        "Email sent — to=%s subject=%r attachments=%s",
        to,
        subject,
        attachment_names,
    )
