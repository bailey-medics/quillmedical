"""The yearly reminder to review the accessibility statement.

The Public Sector Bodies Accessibility Regulations 2018 require the
statement at ``/accessibility-statement`` to be reviewed at least once a
year. The accessibility-review workflow reads the statement's own
REVIEWED date each Monday and, once it is eleven months old, posts to
Slack and runs this, the ``accessibility-reminder`` admin action.

**The app sends the email, and not the workflow,** so that GitHub holds
no mail credential.
"""

from __future__ import annotations

import os
import re
import sys

from app.email.render import render_email, send_args
from app.email_send import (
    EmailNotAllowedError,
    EmailRateLimitError,
    EmailSendError,
    mask_email,
    send_email,
)

#: Where the statement is published.
STATEMENT_URL = "https://quill-medical.com/accessibility-statement"

#: A date as the workflow writes it, such as "25 September 2026". Checked
#: because it goes into an email's subject, and comes from outside.
_DATE = re.compile(r"[0-9]{1,2} [A-Z][a-z]{2,8} [0-9]{4}")

#: An address, loosely: enough to refuse a line break or a second
#: recipient. ``send_email`` and the mail provider do the rest.
_ADDRESS = re.compile(r"[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+")


class ReminderError(Exception):
    """A reminder that cannot be sent, with the reason."""


def send_reminder(*, recipient: str, reviewed: str, due_by: str) -> None:
    """Email the reminder to one address.

    Args:
        recipient: Who is reminded.
        reviewed: When the statement was last reviewed, in words.
        due_by: When the next review is due, in words.

    Raises:
        ReminderError: If an argument is not what it should be, or the
            email could not be sent.
    """
    if not _ADDRESS.fullmatch(recipient):
        raise ReminderError("The recipient is not an email address")

    for name, value in (("reviewed", reviewed), ("due by", due_by)):
        if not _DATE.fullmatch(value):
            raise ReminderError(
                f"The {name} date is not a date such as 25 September 2026"
            )

    rendered = render_email(
        "accessibility_review.html.j2",
        "quill",
        {
            "reviewed": reviewed,
            "due_by": due_by,
            "statement_url": STATEMENT_URL,
        },
    )

    try:
        send_email(to=recipient, **send_args(rendered))
    except (EmailNotAllowedError, EmailRateLimitError, EmailSendError) as exc:
        raise ReminderError(
            f"The reminder could not be sent: {type(exc).__name__}"
        ) from None


def main() -> int:
    """Send the reminder from the environment.

    Reads ``ACCESSIBILITY_RECIPIENT``, ``ACCESSIBILITY_REVIEWED`` and
    ``ACCESSIBILITY_DUE_BY``.

    Returns:
        The exit status: 0 when the email was sent, 1 otherwise.
    """
    recipient = os.environ.get("ACCESSIBILITY_RECIPIENT", "").strip()
    reviewed = os.environ.get("ACCESSIBILITY_REVIEWED", "").strip()
    due_by = os.environ.get("ACCESSIBILITY_DUE_BY", "").strip()

    try:
        send_reminder(recipient=recipient, reviewed=reviewed, due_by=due_by)
    except ReminderError as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 1
    print(f"Reminder sent to {mask_email(recipient)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
