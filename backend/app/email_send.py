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


def _check_rate_limit(recipient: str) -> None:
    """Check and enforce per-recipient email rate limit.

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
    """
    _check_rate_limit(to)

    attachment_names = [a["filename"] for a in (attachments or [])]

    if settings.EMAIL_DRY_RUN:
        logger.info(
            "EMAIL DRY RUN — to=%s subject=%r attachments=%s",
            to,
            subject,
            attachment_names,
        )
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

    logger.info(
        "Email sent — to=%s subject=%r attachments=%s",
        to,
        subject,
        attachment_names,
    )
