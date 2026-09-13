"""The email that asks somebody to come and assess a competency.

One template, rendered in Python rather than loaded from YAML. The
teaching templates in :mod:`app.features.teaching.email_templates` are
configurable because a question bank's coordinator writes them and they
differ per bank. This one is not: it is a fixed transactional message
about a named clinician, and the thing it must never do is vary in ways
nobody reviewed.

**No PHI, and no patient anywhere near it.** A passport is about a
clinician's own competence. The message names the holder, the competency
and the person inviting — never a patient, a procedure performed on
anyone, or any clinical detail of the evidence.

**The recipient may not have heard of Quill.** A consultant at another
trust receives this cold, so it says who is asking, what they are being
asked to do, and how long the link lasts, in that order.
"""

from __future__ import annotations

from html import escape
from typing import TypedDict

#: Where the accept page lives in the frontend. The token travels in the
#: query string, as the patient invite and password reset links do.
ACCEPT_PATH = "/passport/assessors/accept"


class InviteEmail(TypedDict):
    """A rendered invitation, ready for :func:`app.email_send.send_email`."""

    subject: str
    html_body: str


def accept_url(frontend_url: str, token: str) -> str:
    """The link the assessor follows.

    Args:
        frontend_url: ``settings.FRONTEND_URL``, without a trailing slash.
        token: The signed invite token.

    Returns:
        The absolute URL of the accept page, carrying the token.
    """
    return f"{frontend_url.rstrip('/')}{ACCEPT_PATH}?token={token}"


def render_invite(
    *,
    assessor_name: str,
    holder_name: str,
    competency_name: str | None,
    url: str,
    expires_in_days: int,
) -> InviteEmail:
    """Render the invitation.

    Every interpolated value is escaped. The names come from user input
    — a holder types the assessor's name on the invite form — so a name
    containing a bracket must not become markup in somebody's inbox.

    Args:
        assessor_name: Who is being invited, as the holder gave it.
        holder_name: The clinician asking to be assessed.
        competency_name: What they want signed off, if the invitation
            names one. Optional because an invitation can precede the
            request: a holder may bring an assessor in first and choose
            the competency afterwards.
        url: The accept link, from :func:`accept_url`.
        expires_in_days: How long the link lasts, so the recipient knows
            whether they can leave it until after the weekend.

    Returns:
        The subject and HTML body.
    """
    assessor = escape(assessor_name)
    holder = escape(holder_name)
    link = escape(url, quote=True)

    if competency_name:
        subject = f"{holder_name} has asked you to assess a competency"
        asking = (
            f"<p>{holder} has asked you to assess "
            f"<strong>{escape(competency_name)}</strong> and record the "
            "outcome in their clinician passport.</p>"
        )
    else:
        subject = f"{holder_name} has asked you to be an assessor"
        asking = (
            f"<p>{holder} has asked you to act as an assessor and record "
            "outcomes in their clinician passport.</p>"
        )

    body = (
        f"<p>Dear {assessor},</p>"
        f"{asking}"
        "<p>A clinician passport is a record of competencies a clinician "
        "has been assessed as able to perform, signed by the person who "
        "assessed them. You will be asked to confirm your professional "
        "registration before you sign anything.</p>"
        f'<p><a href="{link}">Accept the invitation</a></p>'
        f"<p>This link can be used once and expires in "
        f"{expires_in_days} days.</p>"
        "<p>If you were not expecting this, you can ignore this email "
        "and nothing will happen.</p>"
    )

    return InviteEmail(subject=subject, html_body=body)
