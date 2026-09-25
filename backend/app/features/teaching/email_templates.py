"""Email template loading and rendering for teaching certificates.

Templates are stored in the ``coordinator_email`` and
``student_email`` sections of each bank's ``config.yaml``.
Variables use ``string.Template`` syntax (``$variable``).
Body Markdown is converted to HTML via the ``markdown`` package.
"""

from __future__ import annotations

import logging
from pathlib import Path
from string import Template
from typing import Any, TypedDict

import markdown
import nh3
import yaml
from markupsafe import Markup

from app.email.brand import EmailImage
from app.email.render import EmailPartner, SendEmailArgs, send_args
from app.email.render import render_email as render_branded_email
from app.features.teaching.models import TeachingOrgSettings

logger = logging.getLogger(__name__)


class EmailTemplate(TypedDict):
    """Parsed contents of an email template section."""

    subject: str
    body: str
    attach_certificate: bool


class RenderedEmail(TypedDict):
    """A fully rendered email ready to send."""

    subject: str
    html_body: str
    #: The same body as plain text: the Markdown with its variables filled
    #: in, which reads well as it is.
    body_text: str


def extract_email_template(
    config: dict[str, Any],
    template_name: str,
) -> EmailTemplate | None:
    """Extract an email template from an already-parsed config dict.

    Args:
        config: Parsed config.yaml contents (e.g. from DB config_yaml).
        template_name: Section key, e.g.
            ``"coordinator_email"`` or ``"student_email"``.

    Returns:
        Parsed template dict, or None if section not found.
    """
    key = template_name.replace("-", "_")
    data = config.get(key)

    if not isinstance(data, dict):
        return None

    return EmailTemplate(
        subject=str(data.get("subject", "")),
        body=str(data.get("body", "")),
        attach_certificate=bool(data.get("attach_certificate", True)),
    )


def load_email_template(
    bank_path: Path,
    bank_id: str,
    template_name: str,
) -> EmailTemplate | None:
    """Load an email template from the bank's config.yaml on disk.

    Prefer :func:`extract_email_template` when the config dict is
    already available (e.g. from the database).

    Args:
        bank_path: Root path to all question banks.
        bank_id: Question bank identifier (directory name).
        template_name: Section key in config.yaml, e.g.
            ``"coordinator_email"`` or ``"student_email"``.

    Returns:
        Parsed template dict, or None if section not found.
    """
    config_path = bank_path / bank_id / "config.yaml"
    if not config_path.is_file():
        return None

    with open(config_path, encoding="utf-8") as f:
        loaded: dict[str, Any] = yaml.safe_load(f) or {}

    return extract_email_template(loaded, template_name)


def render_email(
    template: EmailTemplate,
    context: dict[str, str],
) -> RenderedEmail:
    """Substitute variables and convert Markdown body to HTML.

    Uses ``string.Template`` for safe ``$variable`` substitution.
    Unknown variables are left as-is (``safe_substitute``).

    Args:
        template: The parsed YAML template.
        context: Mapping of variable names to their values.

    Returns:
        Rendered email with subject and HTML body.
    """
    subject = Template(template["subject"]).safe_substitute(context)
    body_md = Template(template["body"]).safe_substitute(context)
    html_body = nh3.clean(markdown.markdown(body_md))

    return RenderedEmail(
        subject=subject, html_body=html_body, body_text=body_md.strip()
    )


#: The height every partner logo is shown at in an email's partner strip.
PARTNER_LOGO_HEIGHT = 72


def email_partner(
    settings_row: TeachingOrgSettings | None, context: str
) -> EmailPartner | None:
    """The partner an organisation's teaching emails are sent for.

    Args:
        settings_row: The organisation's teaching settings, if it has any.
        context: What the email is about, shown beside the logo: the
            question bank's title.

    Returns:
        The partner, or ``None`` when the organisation has no settings, in
        which case the email goes out as Quill's own.
    """
    if settings_row is None or not settings_row.institution_name:
        return None
    logo: EmailImage | None = None
    if settings_row.email_logo and settings_row.email_logo_width:
        logo = EmailImage(
            src=f"/email/partners/{settings_row.email_logo}",
            width=settings_row.email_logo_width,
            height=PARTNER_LOGO_HEIGHT,
            # The logo carries the name; the image's alt text names it too
            alt=settings_row.institution_name,
        )
    return EmailPartner(
        name=settings_row.institution_name,
        context=context,
        short_name=settings_row.email_short_name or None,
        reply_to=settings_row.coordinator_email or None,
        logo=logo,
    )


def in_branded_layout(
    rendered: RenderedEmail,
    *,
    reason: str,
    partner: EmailPartner | None,
) -> SendEmailArgs:
    """Place a coordinator-written email in Quill's branded layout.

    The coordinator's words stay exactly as the bank's config.yaml has
    them, already converted from Markdown and sanitised with nh3; Quill
    supplies the header, the partner strip and the footer.

    Args:
        rendered: The email from :func:`render_email`.
        reason: Why the recipient is getting it, for the footer.
        partner: Who it is sent for, from :func:`email_partner`.

    Returns:
        Keyword arguments for ``send_email``, less ``to`` and attachments.
    """
    return send_args(
        render_branded_email(
            "teaching_certificate.html.j2",
            "quill",
            {
                "subject": rendered["subject"],
                "preheader": rendered["subject"],
                # Already sanitised by nh3 in render_email, so marked safe
                # here rather than escaped a second time.
                "body_html": Markup(rendered["html_body"]),
                "body_text": rendered["body_text"],
                "reason": reason,
            },
            partner=partner,
        )
    )
