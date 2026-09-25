# backend/app/email/previews.py
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

from app.email.brand import EmailImage, EmailThemeName
from app.email.render import EmailPartner, RenderedEmail, render_email
from app.features.teaching.email_templates import (
    EmailTemplate,
)
from app.features.teaching.email_templates import (
    render_email as render_teaching_email,
)
from app.paths import EMAIL_PREVIEWS_DIR

THEMES: tuple[EmailThemeName, ...] = ("quill", "ldd")

_EOEETA_NAME = "East of England Endoscopy Training Academy"

#: EoEETA, as its teaching settings would describe it. The reply-to is a
#: placeholder address.
_EOEETA = EmailPartner(
    name=_EOEETA_NAME,
    context="Optical diagnosis accreditation",
    short_name="EoEETA",
    reply_to="coordinator@eoeeta.example",
    logo=EmailImage(
        src="/email/partners/eoeeta-email.png",
        width=162,
        height=72,
        alt="",
    ),
)

#: A student certificate email as a coordinator writes it in a question
#: bank's config.yaml. The score criteria are invented.
_CERTIFICATE_TEMPLATE = EmailTemplate(
    subject="Your certificate for $exam_title",
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
    "recipient_name": "Dr Sam Patel",
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
        "preheader": (
            f"Congratulations on passing {_CERTIFICATE_VALUES['exam_title']}."
        ),
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
                "reset_url": "https://quill-medical.com/reset-password?token=example",
                "ttl_minutes": 30,
            },
        ),
        Preview(
            id="email-verification",
            label="Email verification",
            template="email_verification.html.j2",
            context={
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
                "username": "sam.patel",
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
                "url": "https://quill-medical.com/passport/assessors/accept?token=example",
                "expires_in_days": 14,
            },
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
            context={
                "unsubscribe_url": "#unsubscribe",
                "preferences_url": "#preferences",
            },
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
    from_name = preview.from_name
    if preview.id == "newsletter":
        from_name = "Mark at " + (
            "Quill Medical" if theme == "quill" else "Let's Do Digital"
        )
    return render_email(
        preview.template,
        theme,
        preview.context,
        partner=preview.partner,
        from_name=from_name,
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
