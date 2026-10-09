"""Render every email with sample values, for Storybook to show.

Storybook's Foundations/Emails stories show what the backend actually
sends, not a copy of the design. CI's Storybook build runs without
Python, so it cannot render the templates itself: the renders are
committed, and ``tests/test_email_previews.py`` fails when a template
changes and they are not rendered again.

Run with ``just email-preview``, which writes one HTML file per preview
and theme, and an ``index.json`` holding the inbox line each preview
shows above its email.

Image paths in a preview are relative, so Storybook serves them from
``frontend/public/``; a sent email has absolute ones.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from markupsafe import Markup

from app.email.brand import EmailImage
from app.email.render import EmailPartner, RenderedEmail, render_email
from app.email.theme import EMAIL_THEME_NAMES, EmailThemeName
from app.features.teaching.email_templates import (
    EmailTemplate,
)
from app.features.teaching.email_templates import (
    render_email as render_teaching_email,
)
from app.paths import EMAIL_PREVIEWS_DIR

THEMES: tuple[EmailThemeName, ...] = EMAIL_THEME_NAMES

_EOEETA_NAME = "East of England Endoscopy Training Academy"

#: EoEETA, as its teaching settings would describe it. The reply-to is a
#: placeholder address.
_EOEETA = EmailPartner(
    name=_EOEETA_NAME,
    # What the teaching router passes: the question bank's title
    context="Optical diagnosis of diminutive colorectal polyps",
    short_name="EoEETA",
    reply_to="coordinator@eoeeta.example",
    logo=EmailImage(
        src="/email/partners/eoeeta-email.png",
        width=162,
        height=72,
        alt=_EOEETA_NAME,
    ),
)

#: A student certificate email as a coordinator writes it in a question
#: bank's config.yaml. The score criteria are invented.
_CERTIFICATE_TEMPLATE = EmailTemplate(
    subject="Your certificate for $exam_title",
    preheader="You passed on $completion_date. Your certificate is attached.",
    body=(
        "Dear $recipient_name,\n\n"
        "Congratulations on passing **$exam_title**!\n\n"
        "**Date**: $completion_date\n\n"
        "**Score summary**:\n\n"
        "$score_summary\n\n"
        "Your certificate is attached to this email.\n\n"
        "Well done!\n\n"
        "$institution_name\n"
    ),
    attach_certificate=True,
)

_CERTIFICATE_VALUES = {
    "recipient_name": "Dr John Smith",
    "exam_title": "Optical diagnosis of diminutive colorectal polyps",
    "completion_date": "25 September 2026",
    "score_summary": "Overall accuracy: 92%, High-confidence accuracy: 95%",
    "institution_name": _EOEETA_NAME,
}


def _certificate_context() -> dict[str, Any]:
    """The certificate's context, built the way the teaching router does."""
    rendered = render_teaching_email(
        _CERTIFICATE_TEMPLATE, _CERTIFICATE_VALUES
    )

    return {
        "subject": rendered["subject"],
        # As the teaching router sends it: the coordinator's own
        # preheader, or the subject again where they wrote none.
        "preheader": rendered["preheader"],
        "body_html": Markup(rendered["html_body"]),
        "body_text": rendered["body_text"],
        "reason": "You are receiving this because you sat an assessment on Quill.",
    }


@dataclass(frozen=True)
class Preview:
    """One email, with the sample values it is rendered with.

    Attributes:
        id: The file name stem and the story's key, such as
            ``"password-reset"``.
        label: What the story's control shows.
        template: The template under ``app/email/templates/``.
        context: Sample values for the template.
        partner: Set for an email sent for a partner.
        from_name: Set where the sender is a person.
    """

    id: str
    label: str
    template: str
    context: dict[str, Any] = field(default_factory=dict)
    partner: EmailPartner | None = None
    from_name: str | None = None


def previews() -> list[Preview]:
    """Every preview, in the order the stories list them."""
    return [
        Preview(
            id="password-reset",
            label="Password reset",
            template="password_reset.html.j2",
            context={
                "name": "John Smith",
                "username": "john.smith",
                "email": "john.smith@example.org",
                "reset_url": "https://quill-medical.com/reset-password?token=example",
                "ttl_minutes": 30,
            },
        ),
        Preview(
            id="email-verification",
            label="Email verification",
            template="email_verification.html.j2",
            context={
                "name": "John Smith",
                "username": "john.smith",
                "email": "john.smith@example.org",
                "verify_url": (
                    "https://quill-medical.com/verify-email?token=example"
                ),
                "ttl_minutes": 60,
                "welcome": True,
            },
        ),
        Preview(
            id="account-invite",
            label="Account invitation",
            template="account_invite.html.j2",
            context={
                "name": "John Smith",
                "username": "john.smith",
                "email": "john.smith@example.org",
                "setup_url": (
                    "https://quill-medical.com/reset-password?token=example"
                ),
                "ttl_minutes": 30,
            },
        ),
        Preview(
            id="passport-invite",
            label="Passport assessor invite",
            template="passport_invite.html.j2",
            context={
                "assessor_name": "Dr James Okafor",
                "holder_name": "Dr Priya Shah",
                "competency_name": "Chest drain insertion (Seldinger)",
                "scope_name": None,
                "level_name": None,
                "confirming_logbook": False,
                "has_account": False,
                "url": "https://quill-medical.com/passport/assessors/accept?token=example",
                "expires_in_days": 14,
            },
        ),
        Preview(
            id="passport-invite-to-an-account-holder",
            label="Passport assessor invite, to somebody with an account",
            template="passport_invite.html.j2",
            context={
                "assessor_name": "Dr James Okafor",
                "holder_name": "Dr Priya Shah",
                "competency_name": "Chest drain insertion (Seldinger)",
                "scope_name": None,
                "level_name": None,
                "confirming_logbook": False,
                "has_account": True,
                "url": "https://quill-medical.com/inbox",
                "expires_in_days": 14,
            },
        ),
        Preview(
            id="passport-invite-with-level",
            label="Passport assessor invite, at a level",
            template="passport_invite.html.j2",
            context={
                "assessor_name": "Dr James Okafor",
                "holder_name": "Dr Priya Shah",
                "competency_name": (
                    "Interpret imaging for target volume and organ-at-risk "
                    "definition"
                ),
                "scope_name": None,
                "level_name": "Entrusted to act unsupervised",
                "confirming_logbook": False,
                "has_account": False,
                "url": "https://quill-medical.com/passport/assessors/accept?token=example",
                "expires_in_days": 14,
            },
        ),
        Preview(
            id="accessibility-review",
            label="Accessibility statement review",
            template="accessibility_review.html.j2",
            context={
                "reviewed": "25 September 2026",
                "due_by": "25 September 2027",
                "statement_url": (
                    "https://quill-medical.com/accessibility-statement"
                ),
            },
        ),
        Preview(
            id="passport-invite-with-scope",
            label="Passport assessor invite, for one scope at a level",
            template="passport_invite.html.j2",
            context={
                "assessor_name": "Dr James Okafor",
                "holder_name": "Dr Priya Shah",
                "competency_name": (
                    "Review and prescribe systemic anti-cancer therapy"
                ),
                "scope_name": "Lung",
                "level_name": "Prescribe second cycle onwards",
                "confirming_logbook": False,
                "has_account": False,
                "url": "https://quill-medical.com/passport/assessors/accept?token=example",
                "expires_in_days": 14,
            },
        ),
        Preview(
            id="passport-invite-to-confirm-a-logbook-entry",
            label="Passport invite, to confirm a logbook entry",
            template="passport_invite.html.j2",
            context={
                "assessor_name": "Dr James Okafor",
                "holder_name": "Dr Priya Shah",
                "competency_name": (
                    "Review and prescribe systemic anti-cancer therapy"
                ),
                "scope_name": None,
                "level_name": None,
                "confirming_logbook": True,
                "has_account": False,
                "url": "https://quill-medical.com/passport/assessors/accept?token=example",
                "expires_in_days": 14,
            },
        ),
        Preview(
            id="feedback-received",
            label="Feedback received",
            template="feedback_received.html.j2",
            context={
                "sender": "john.smith",
                "category": "Something is wrong or inaccurate",
                "route": "/teaching/:bankId",
                "url": "https://quill-medical.com/admin/feedback/12",
            },
        ),
        Preview(
            id="feedback-reply",
            label="Feedback reply",
            template="feedback_reply.html.j2",
            context={"url": "https://quill-medical.com/feedback"},
        ),
        Preview(
            id="certificate",
            label="EoEETA certificate",
            template="teaching_certificate.html.j2",
            context=_certificate_context(),
            partner=_EOEETA,
        ),
        Preview(
            id="certificate-without-logo",
            label="EoEETA certificate, no logo on file",
            template="teaching_certificate.html.j2",
            context=_certificate_context(),
            partner=EmailPartner(
                name=_EOEETA.name,
                context=_EOEETA.context,
                short_name=_EOEETA.short_name,
                reply_to=_EOEETA.reply_to,
            ),
        ),
        Preview(
            id="newsletter",
            label="Newsletter",
            template="previews/newsletter_sample.html.j2",
            context={"unsubscribe_url": "#unsubscribe"},
        ),
        Preview(
            id="newsletter-from-a-person",
            label="Newsletter, from a person",
            template="previews/newsletter_personal_sample.html.j2",
            context={"unsubscribe_url": "#unsubscribe"},
        ),
    ]


def render_preview(preview: Preview, theme: EmailThemeName) -> RenderedEmail:
    """Render one preview in one theme, with relative image paths.

    Args:
        preview: The preview.
        theme: ``"quill"`` or ``"ldd"``.

    Returns:
        The rendered email.
    """
    return render_email(
        preview.template,
        theme,
        preview.context,
        partner=preview.partner,
        from_name=preview.from_name,
        # Relative paths, so Storybook serves the images from its own
        # static folder rather than the live site.
        asset_base_url="",
    )


def _tidy(text: str) -> str:
    """Trim trailing spaces and end with one newline.

    The repository's pre-commit hooks would otherwise rewrite the committed
    file, and it would then never match a fresh render.
    """
    lines = [line.rstrip() for line in text.splitlines()]

    return "\n".join(lines).strip("\n") + "\n"


def file_name(preview: Preview, theme: EmailThemeName) -> str:
    """The committed file a preview renders to."""
    return f"{preview.id}--{theme}.html"


def build() -> dict[str, str]:
    """Every preview file's contents, keyed by file name, with the index.

    Returns:
        ``{file name: contents}`` for each render and ``index.json``.
    """
    files: dict[str, str] = {}
    index: list[dict[str, Any]] = []

    for preview in previews():
        entry: dict[str, Any] = {"id": preview.id, "label": preview.label}
        for theme in THEMES:
            rendered = render_preview(preview, theme)
            name = file_name(preview, theme)
            files[name] = _tidy(rendered["html_body"])
            entry[theme] = {
                "file": name,
                "subject": rendered["subject"],
                "preheader": rendered["preheader"],
                "fromName": rendered["from_name"],
                "replyTo": rendered["reply_to"],
            }
        index.append(entry)

    files["index.json"] = (
        json.dumps(index, indent=2, ensure_ascii=False) + "\n"
    )

    return files


def write(directory: Path = EMAIL_PREVIEWS_DIR) -> list[Path]:
    """Write every preview to *directory*, removing any it no longer makes.

    Args:
        directory: Where to write, normally :data:`EMAIL_PREVIEWS_DIR`.

    Returns:
        The files written.
    """
    directory.mkdir(parents=True, exist_ok=True)
    files = build()

    for stale in directory.iterdir():
        if stale.is_file() and stale.name not in files:
            stale.unlink()

    written: list[Path] = []

    for name, contents in files.items():
        path = directory / name
        path.write_text(contents, encoding="utf-8")
        written.append(path)

    return written


if __name__ == "__main__":
    for path in write():
        print(f"  ✓ {path.name}")
