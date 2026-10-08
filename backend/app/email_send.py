"""Email sending module.

Delivers email through Amazon SES in London, so that email data stays in
the UK; see docs/docs/plans/2026-10-06-amazon-ses-email-plan.md.
When ``EMAIL_DRY_RUN`` is True (the default in development), emails
are logged to stdout instead of being sent.
"""

import logging
import mimetypes
import threading
import time
from collections.abc import Mapping
from email.message import EmailMessage
from typing import TypedDict

import boto3
from botocore.config import Config

from app.config import settings

logger = logging.getLogger(__name__)


def mask_email(address: str) -> str:
    """An email address with most of it hidden, for a log line.

    Enough is kept to tell two addresses apart when reading logs beside
    a known one, and not enough to read off who somebody is:
    ``mark@example.org`` becomes ``m***@e***.org``. An address is
    personal data, and for a patient's account it would sit in the logs
    beside the fact that they have one.

    Args:
        address: The address to hide.

    Returns:
        The masked address, or ``***`` for anything that is not one.
    """
    local, at, domain = address.strip().partition("@")
    if not at or not local or not domain:
        return "***"
    name, dot, ending = domain.rpartition(".")
    if not dot or not name:
        return f"{local[0]}***@***"
    return f"{local[0]}***@{name[0]}***.{ending}"


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


class EmailSendError(RuntimeError):
    """Raised when the mail provider refuses a send or cannot be reached.

    Carries the provider's message with the credentials taken out, and
    not the exception it came from: an error for a malformed header can
    quote the header, key and all, so anything that logged the original
    traceback would write the key into the logs.
    """


def _redact(message: str, secret: str) -> str:
    """*message* with every copy of *secret* replaced."""
    return message.replace(secret, "[redacted]") if secret else message


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
        mask_email(recipient),
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
                mask_email(recipient),
                len(timestamps),
                _EMAIL_WINDOW_SECONDS,
            )
            raise EmailRateLimitError(
                f"Rate limit exceeded: max {_EMAIL_MAX_PER_WINDOW} "
                f"emails per {_EMAIL_WINDOW_SECONDS}s for "
                f"{mask_email(recipient)}"
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


#: Headers a caller may not set: the ones ``send_email`` writes itself.
_OWN_HEADERS = frozenset({"from", "to", "subject", "reply-to", "cc", "bcc"})


def _checked_headers(headers: Mapping[str, str] | None) -> dict[str, str]:
    """Extra headers for a message, refused if any could do harm.

    Args:
        headers: Header name to value, such as the ``List-Unsubscribe``
            pair a newsletter carries.

    Returns:
        The same headers, as a plain dict. Empty for None.

    Raises:
        ValueError: If a name or value holds a line break, which would
            let it start another header, if a name is not a plain header
            name, or if it is one ``send_email`` writes itself.
    """
    checked: dict[str, str] = {}
    for name, value in (headers or {}).items():
        if not name or not all(c.isalnum() or c == "-" for c in name):
            raise ValueError(f"Not a header name: {name!r}")
        if name.lower() in _OWN_HEADERS:
            raise ValueError(f"send_email sets {name} itself")
        if "\r" in value or "\n" in value:
            raise ValueError(f"Line break in the {name} header")
        checked[name] = value
    return checked


#: Characters that would let a display name break out of the From header.
_UNSAFE_IN_NAME = frozenset('"<>\r\n')


#: Characters that have no place in a sending address.
_UNSAFE_IN_ADDRESS = frozenset('"<>\r\n ,;')


def _from_header(
    from_name: str | None, from_address: str | None = None
) -> str:
    """The From header: the sending address, with a display name if given.

    Args:
        from_name: What the recipient's inbox shows as the sender, for
            example ``"EoEETA via Quill Medical"``. ``None`` sends from the
            bare address.
        from_address: The address to send from, when not
            ``settings.EMAIL_FROM``. A newsletter sent as another brand
            passes that brand's own.

    Returns:
        The address, or ``"Name" <address>``.

    Raises:
        ValueError: If the name holds a quote, an angle bracket or a line
            break, or the address is not a plain one. Any of them could
            end the header early and let the rest be read as another
            header or another address.
    """
    address = settings.EMAIL_FROM if from_address is None else from_address
    if from_address is not None and (
        address.count("@") != 1 or _UNSAFE_IN_ADDRESS & set(address)
    ):
        raise ValueError(f"Unsafe sender address: {from_address!r}")
    if from_name is None:
        return address
    if not from_name.strip() or _UNSAFE_IN_NAME & set(from_name):
        raise ValueError(f"Unsafe sender name: {from_name!r}")
    return f'"{from_name}" <{address}>'


#: How long SES is given. Short to connect and one retry, because a
#: caller is a person waiting on a page, and a connection that has not
#: opened in three seconds is not about to.
_SES_CONFIG = Config(
    connect_timeout=3,
    read_timeout=20,
    retries={"max_attempts": 2, "mode": "standard"},
)


def _mime_message(
    *,
    sender: str,
    to: str,
    subject: str,
    html_body: str,
    text_body: str | None,
    reply_to: str | None,
    attachments: list[Attachment],
    headers: Mapping[str, str] | None = None,
) -> bytes:
    """The email as a raw MIME message, which is what SES is handed.

    Raw, not SES's simpler form of a subject and two bodies, because that
    form cannot carry an attachment and a certificate is one.

    Args:
        sender: The From header, already checked by :func:`_from_header`.
        to: Recipient email address.
        subject: Email subject line.
        html_body: HTML content of the email body.
        text_body: A plain-text version of the same email, if there is one.
        reply_to: Where a reply goes, when not to the sender.
        attachments: Files to attach.
        headers: Extra headers, already checked by
            :func:`_checked_headers`.

    Returns:
        The message, encoded and ready to send.
    """
    message = EmailMessage()
    message["From"] = sender
    message["To"] = to
    message["Subject"] = subject
    if reply_to is not None:
        message["Reply-To"] = reply_to
    for name, value in (headers or {}).items():
        message[name] = value

    if text_body is None:
        message.set_content(html_body, subtype="html")
    else:
        message.set_content(text_body)
        message.add_alternative(html_body, subtype="html")

    for attachment in attachments:
        guessed, _ = mimetypes.guess_type(attachment["filename"])
        content_type = guessed or "application/octet-stream"
        maintype, _, subtype = content_type.partition("/")
        message.add_attachment(
            attachment["content"],
            maintype=maintype,
            subtype=subtype,
            filename=attachment["filename"],
        )

    return message.as_bytes()


def _send_with_ses(*, sender: str, to: str, raw_message: bytes) -> bool:
    """Send one raw message through Amazon SES.

    The client is pinned to ``settings.SES_REGION``. Everything in SES is
    per region, and a send from another one is email data outside the UK.

    Args:
        sender: The From header.
        to: Recipient email address.
        raw_message: The MIME message from :func:`_mime_message`.

    Returns:
        True once SES has accepted the message. False if the credentials
        are not configured, when nothing is sent.

    Raises:
        EmailSendError: If SES refuses the send or cannot be reached.
    """
    key_id = settings.SES_ACCESS_KEY_ID
    secret = settings.SES_SECRET_ACCESS_KEY
    if not key_id or not secret:
        logger.error(
            "Cannot send email: SES_ACCESS_KEY_ID and "
            "SES_SECRET_ACCESS_KEY are not configured"
        )
        return False

    # Stripped because a value stored with `echo` ends in a newline, and
    # a signature made with it is refused.
    key_id_value = key_id.get_secret_value().strip()
    secret_value = secret.get_secret_value().strip()

    try:
        client = boto3.client(
            "sesv2",
            region_name=settings.SES_REGION,
            aws_access_key_id=key_id_value,
            aws_secret_access_key=secret_value,
            config=_SES_CONFIG,
        )
        client.send_email(
            FromEmailAddress=sender,
            Destination={"ToAddresses": [to]},
            Content={"Raw": {"Data": raw_message}},
        )
    except Exception as exc:
        # `from None`, so nothing that may quote a credential is attached
        # to the exception callers log.
        message = _redact(_redact(str(exc), secret_value), key_id_value)
        raise EmailSendError(message) from None

    return True


def send_email(
    *,
    to: str,
    subject: str,
    html_body: str,
    attachments: list[Attachment] | None = None,
    text_body: str | None = None,
    reply_to: str | None = None,
    from_name: str | None = None,
    headers: Mapping[str, str] | None = None,
    from_address: str | None = None,
) -> None:
    """Send a single email, or log it when in dry-run mode.

    Args:
        to: Recipient email address.
        subject: Email subject line.
        html_body: HTML content of the email body.
        attachments: Optional list of file attachments.
        text_body: A plain-text version of the same email. Sent alongside
            the HTML: it helps deliverability, and is what some screen
            readers and text-only clients show.
        reply_to: Where a reply goes, when not to the sender. Emails sent
            for a partner set this to the partner's coordinator.
        from_name: The sender's display name, such as
            ``"EoEETA via Quill Medical"``. The address stays
            ``settings.EMAIL_FROM``.
        from_address: The address to send from, when not
            ``settings.EMAIL_FROM``. It must be on a domain the mail
            provider has verified.
        headers: Extra headers. A newsletter passes ``List-Unsubscribe``
            and ``List-Unsubscribe-Post``, which mailbox providers
            require of bulk mail.

    Raises:
        EmailRateLimitError: If the recipient has exceeded the hourly limit.
        EmailNotAllowedError: If an allow-list is set and the recipient is
            not on it.
        EmailSendError: If the mail provider refuses the send or cannot
            be reached.
        ValueError: If *from_name* could break the From header, or a
            header in *headers* is not safe to send.
    """
    _check_allowed(to)
    sender = _from_header(from_name, from_address)
    extra_headers = _checked_headers(headers)
    _check_rate_limit(to)

    # Counted for the log, never named in it. Neither is the subject. A
    # certificate's subject and its file name both carry the person's
    # name, and a log line is no place for who was sent what.
    attachment_names = [a["filename"] for a in (attachments or [])]

    if settings.EMAIL_DRY_RUN:
        logger.info(
            "EMAIL DRY RUN - to=%s attachments=%d",
            mask_email(to),
            len(attachment_names),
        )
        _record_send(to)
        return

    sent = _send_with_ses(
        sender=sender,
        to=to,
        raw_message=_mime_message(
            sender=sender,
            to=to,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
            reply_to=reply_to,
            attachments=attachments or [],
            headers=extra_headers,
        ),
    )
    if not sent:
        return
    _record_send(to)

    logger.info(
        "Email sent - to=%s attachments=%d",
        mask_email(to),
        len(attachment_names),
    )
