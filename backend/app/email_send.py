"""Email sending module.

Uses Resend (https://resend.com) to deliver transactional email.
When ``EMAIL_DRY_RUN`` is True (the default in development), emails
are logged to stdout instead of being sent.
"""

import logging
from typing import TypedDict

import resend

from app.config import settings

logger = logging.getLogger(__name__)


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
    """
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
