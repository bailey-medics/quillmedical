# backend/app/email/render.py
"""Render a branded email from a template, a theme and its values.

Every email extends ``templates/base.html.j2``, the layout signed off as a
static mock-up in Phase 1 of the email branding plan, and fills its blocks.
One function, :func:`render_email`, turns a template name, a theme and a
context into everything :func:`app.email_send.send_email` needs.

**Autoescaping is on.** Every value put into a template is escaped unless
it is marked safe, so a name containing a bracket cannot become markup in
somebody's inbox. Before this, each email escaped its own values one call
at a time, and a new email could forget one.

**Undefined is an error.** A template naming a value the caller did not
pass fails at render (:class:`jinja2.StrictUndefined`) rather than sending
an email with a gap in it.
"""

import html
import re
from dataclasses import dataclass
from typing import Any, TypedDict

from jinja2 import (
    BaseLoader,
    ChoiceLoader,
    Environment,
    PackageLoader,
    StrictUndefined,
    select_autoescape,
)
from markupsafe import Markup, escape

from app.config import settings
from app.email.brand import EmailImage, EmailThemeName, email_theme


@dataclass(frozen=True)
class EmailPartner:
    """A partner an email is sent for, such as EoEETA.

    Attributes:
        name: Their full name, shown in the partner strip and the footer.
        context: What the email is about, in the partner's words, such as
            "Optical diagnosis accreditation".
        short_name: For the sender line, "EoEETA via Quill Medical".
            ``None`` leaves the sender as the theme's own name.
        reply_to: Where a reply goes: the partner's coordinator.
        logo: Their logo at display size. ``None`` shows their name in the
            strip instead.
    """

    name: str
    context: str
    short_name: str | None = None
    reply_to: str | None = None
    logo: EmailImage | None = None


class RenderedEmail(TypedDict):
    """Everything :func:`app.email_send.send_email` needs for one email."""

    subject: str
    html_body: str
    text_body: str
    from_name: str
    reply_to: str | None


_ACCENT = re.compile(r"\*([^*]+)\*")


def accent(text: str, colour: str) -> Markup:
    """Set words wrapped in ``*asterisks*`` in italic, in *colour*.

    As ``PublicTitle`` does on the public site. The text is escaped first,
    so only the emphasis this adds is markup.

    Args:
        text: A heading, such as ``"Reset your *password*"``.
        colour: The theme's accent colour, a hex value.

    Returns:
        The heading as safe markup.
    """
    escaped = str(escape(text))
    return Markup(
        _ACCENT.sub(
            f'<em style="font-style: italic; color: {escape(colour)}">'
            r"\1</em>",
            escaped,
        )
    )


def asset(path: str) -> str:
    """An image path as the absolute URL an email client can load.

    Args:
        path: The path under the public site, such as
            ``"/email/quill-wordmark.png"``.

    Returns:
        ``settings.EMAIL_ASSET_BASE_URL`` joined to *path*.
    """
    return settings.EMAIL_ASSET_BASE_URL.rstrip("/") + "/" + path.lstrip("/")


def make_environment(extra: BaseLoader | None = None) -> Environment:
    """The Jinja environment every email renders in.

    Args:
        extra: Further templates to look in first. Tests use this to
            render a template of their own against the real base layout.

    Returns:
        An environment with autoescaping and strict undefined values.
    """
    package = PackageLoader("app.email", "templates")
    loader: BaseLoader = (
        package if extra is None else ChoiceLoader([extra, package])
    )
    env = Environment(
        loader=loader,
        autoescape=select_autoescape(
            enabled_extensions=("j2",), default_for_string=True
        ),
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["accent"] = accent
    env.globals["asset"] = asset
    return env


_ENV: Environment = make_environment()


def _font_link(theme_name: EmailThemeName) -> str:
    """The Google Fonts stylesheet URL for a theme's fonts."""
    params = "&".join(
        f"family={font.family.replace(' ', '+')}:{font.axes}"
        for font in email_theme(theme_name).fonts
    )
    return f"https://fonts.googleapis.com/css2?{params}&display=swap"


def _plain(rendered: str) -> str:
    """Undo HTML escaping and tidy blank lines, for a plain-text part.

    Autoescaping applies to every block, but the subject and the text part
    are not HTML: an ampersand in a name must reach the reader as ``&``,
    not ``&amp;``.
    """
    text = html.unescape(rendered)
    lines = [line.strip() for line in text.splitlines()]
    collapsed = re.sub(r"\n{3,}", "\n\n", "\n".join(lines))
    return collapsed.strip()


def render_email(
    template: str,
    theme: EmailThemeName,
    context: dict[str, Any],
    *,
    partner: EmailPartner | None = None,
    env: Environment | None = None,
) -> RenderedEmail:
    """Render one email.

    Args:
        template: The template's file name under ``templates/``, such as
            ``"password_reset.html.j2"``.
        theme: ``"quill"`` or ``"ldd"``.
        context: The values the template names. Anything missing fails.
        partner: Set for an email sent for a partner: shows the partner
            strip, names them in the footer and sender, and sends replies
            to them.
        env: Another environment, for tests; normally the module's own.

    Returns:
        The subject, HTML, plain text, sender name and reply-to.

    Raises:
        jinja2.UndefinedError: If the template names a value the context
            does not hold.
        jinja2.TemplateNotFound: If there is no such template.
    """
    environment = env or _ENV
    t = email_theme(theme)
    values: dict[str, Any] = {
        **context,
        "t": t,
        "font_link": _font_link(theme),
        "partner": partner,
    }
    compiled = environment.get_template(template)
    page = compiled.new_context(values)

    subject = _plain("".join(compiled.blocks["subject"](page)))
    text = _plain("".join(compiled.blocks["text"](page)))
    body = compiled.render(values)

    from_name = t.sender_name
    if partner is not None and partner.short_name:
        from_name = f"{partner.short_name} via {t.sender_name}"

    return RenderedEmail(
        subject=subject,
        html_body=body,
        text_body=text,
        from_name=from_name,
        reply_to=partner.reply_to if partner is not None else None,
    )
