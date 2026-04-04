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

    return RenderedEmail(subject=subject, html_body=html_body)
