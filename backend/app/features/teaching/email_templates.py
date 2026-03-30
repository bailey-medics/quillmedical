"""Email template loading and rendering for teaching certificates.

Templates are per-bank YAML files (``coordinator-email.yaml``,
``student-email.yaml``) stored alongside question-bank content.
Variables use ``string.Template`` syntax (``$variable``).
Body Markdown is converted to HTML via the ``markdown`` package.
"""

from __future__ import annotations

import logging
from pathlib import Path
from string import Template
from typing import Any, TypedDict

import markdown
import yaml

logger = logging.getLogger(__name__)


class EmailTemplate(TypedDict):
    """Parsed contents of an email template YAML file."""

    subject: str
    body: str
    attach_certificate: bool


class RenderedEmail(TypedDict):
    """A fully rendered email ready to send."""

    subject: str
    html_body: str


def load_email_template(
    bank_path: Path,
    bank_id: str,
    template_name: str,
) -> EmailTemplate | None:
    """Load and parse an email template YAML file.

    Args:
        bank_path: Root path to all question banks.
        bank_id: Question bank identifier (directory name).
        template_name: Template name without ``.yaml`` extension,
            e.g. ``"coordinator-email"`` or ``"student-email"``.

    Returns:
        Parsed template dict, or None if file not found.
    """
    path = bank_path / bank_id / f"{template_name}.yaml"
    if not path.is_file():
        return None

    with open(path, encoding="utf-8") as f:
        data: dict[str, Any] = yaml.safe_load(f)

    if not isinstance(data, dict):
        logger.warning("Invalid email template %s: expected mapping", path)
        return None

    return EmailTemplate(
        subject=str(data.get("subject", "")),
        body=str(data.get("body", "")),
        attach_certificate=bool(data.get("attach_certificate", True)),
    )


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
    html_body = markdown.markdown(body_md)

    return RenderedEmail(subject=subject, html_body=html_body)
