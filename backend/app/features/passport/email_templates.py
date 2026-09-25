"""The email that asks somebody to come and assess a competency.

One fixed template, ``app/email/templates/passport_invite.html.j2``,
rather than one loaded from a question bank's YAML. The
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

from typing import TypedDict

from app.email.render import render_email

#: Where the accept page lives in the frontend. The token travels in the
#: query string, as the patient invite and password reset links do.
ACCEPT_PATH = "/passport/assessors/accept"


class InviteEmail(TypedDict):
    """A rendered invitation, ready for :func:`app.email_send.send_email`."""

    subject: str
    html_body: str
    text_body: str


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
    """Render the invitation, in the branded layout.

    The words are in ``app/email/templates/passport_invite.html.j2``.
    Every value is escaped there: the names come from user input (a holder
    types the assessor's name on the invite form), so a name containing a
    bracket must not become markup in somebody's inbox.

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
        The subject, HTML body and plain-text body.
    """
    rendered = render_email(
        "passport_invite.html.j2",
        "quill",
        {
            "assessor_name": assessor_name,
            "holder_name": holder_name,
            "competency_name": competency_name,
            "url": url,
            "expires_in_days": expires_in_days,
        },
    )
    return InviteEmail(
        subject=rendered["subject"],
        html_body=rendered["html_body"],
        text_body=rendered["text_body"],
    )
