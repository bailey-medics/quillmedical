"""Rendering a branded email: app/email/render.py and its base layout."""

import re
from unittest.mock import MagicMock, patch

import pytest
from jinja2 import DictLoader, Environment, UndefinedError

from app.email.brand import EmailImage, email_theme
from app.email.render import (
    EmailPartner,
    RenderedEmail,
    accent,
    make_environment,
    render_email,
)

#: A child template written the way a real email is: extends the base,
#: uses the components, fills every block.
_SAMPLE = """\
{% extends "base.html.j2" %}
{% import "_components.html.j2" as c with context %}
{% block subject %}Hello {{ name }}{% endblock %}
{% block preheader %}A line for the inbox{% endblock %}
{% block body %}
{{ c.heading("Welcome, *" ~ name ~ "*") }}
{{ c.paragraph("Dear " ~ name ~ ",") }}
{% call c.paragraph() %}Some <strong>bold</strong> words.{% endcall %}
{{ c.button("Continue", url) }}
{% call c.panel() %}{{ c.subheading("Inside", t.panel_heading) }}{% endcall %}
{{ c.small("The link lasts a while.") }}
{% endblock %}
{% block reason %}You asked for this.{% endblock %}
{% block text %}
Dear {{ name }},

Go to {{ url }}
{% endblock %}
"""


@pytest.fixture
def env() -> Environment:
    return make_environment(DictLoader({"sample.html.j2": _SAMPLE}))


def _render(
    env: Environment,
    theme: str = "quill",
    partner: EmailPartner | None = None,
    **context: str,
) -> RenderedEmail:
    values = {"name": "Sam", "url": "https://example.com/go"} | context
    return render_email(
        "sample.html.j2",
        theme,  # type: ignore[arg-type]
        values,
        partner=partner,
        env=env,
    )


EOEETA = EmailPartner(
    name="East of England Endoscopy Training Academy",
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


class TestEscaping:
    def test_escapes_a_hostile_name_everywhere(self, env: Environment) -> None:
        rendered = _render(env, name='<script>alert("x")</script>')

        assert "<script>" not in rendered["html_body"]
        assert "&lt;script&gt;" in rendered["html_body"]

    def test_plain_parts_carry_the_characters_themselves(
        self, env: Environment
    ) -> None:
        rendered = _render(env, name="Tom & Jerry")

        assert rendered["subject"] == "Hello Tom & Jerry"
        assert "Dear Tom & Jerry," in rendered["text_body"]
        assert "Tom &amp; Jerry" in rendered["html_body"]

    def test_accent_escapes_before_adding_emphasis(self) -> None:
        marked = accent("<b>Reset</b> your *password*", "#a87b2f")

        assert "&lt;b&gt;" in marked
        assert (
            '<em style="font-style: italic; color: #a87b2f">password</em>'
            in marked
        )


class TestThemes:
    def test_quill_uses_its_navy_header_and_serif_headings(
        self, env: Environment
    ) -> None:
        html = _render(env, "quill")["html_body"]

        assert "background-color: #001a36" in html
        assert "Cormorant Garamond" in html
        assert "4px solid #c8963e" in html

    def test_ldd_uses_its_own_font_logo_and_name(
        self, env: Environment
    ) -> None:
        html = _render(env, "ldd")["html_body"]

        assert "Source Sans 3" in html
        assert "/email/ldd-logo.png" in html
        assert "Let’s Do Digital" in html
        assert "Cormorant" not in html

    def test_each_theme_names_itself_as_sender(self, env: Environment) -> None:
        assert _render(env, "quill")["from_name"] == "Quill Medical"
        assert _render(env, "ldd")["from_name"] == "Let's Do Digital"


class TestLayout:
    def test_puts_the_preheader_in_a_hidden_block(
        self, env: Environment
    ) -> None:
        html = _render(env)["html_body"]

        assert "display: none" in html
        assert "A line for the inbox" in html
        assert "<title>Hello Sam</title>" in html

    def test_footer_says_who_sent_it_and_why(self, env: Environment) -> None:
        html = _render(env)["html_body"]

        assert "You asked for this." in html
        assert "Quill Medical is a trading name of Bailey Medics Ltd." in html

    def test_gives_classic_outlook_its_fixed_width(
        self, env: Environment
    ) -> None:
        html = _render(env)["html_body"]

        assert "<!--[if mso]>" in html
        assert "max-width: 900px" in html

    def test_every_image_is_an_absolute_url(self, env: Environment) -> None:
        html = _render(env, partner=EOEETA)["html_body"]
        sources = re.findall(r'src="([^"]+)"', html)

        assert sources
        for source in sources:
            assert source.startswith("https://"), source

    @patch("app.email.render.settings")
    def test_images_come_from_the_configured_site(
        self, mock_settings: MagicMock, env: Environment
    ) -> None:
        mock_settings.EMAIL_ASSET_BASE_URL = "https://assets.example/"
        html = _render(env)["html_body"]

        assert 'src="https://assets.example/email/quill-wordmark.png"' in html

    def test_text_part_is_plain(self, env: Environment) -> None:
        text = _render(env)["text_body"]

        assert text == "Dear Sam,\n\nGo to https://example.com/go"


class TestPartner:
    def test_no_partner_means_no_strip_and_no_reply_to(
        self, env: Environment
    ) -> None:
        rendered = _render(env)

        assert "Endoscopy" not in rendered["html_body"]
        assert rendered["reply_to"] is None
        assert rendered["from_name"] == "Quill Medical"

    def test_partner_shows_in_strip_sender_reply_to_and_footer(
        self, env: Environment
    ) -> None:
        rendered = _render(env, partner=EOEETA)
        html = rendered["html_body"]

        assert "/email/partners/eoeeta-email.png" in html
        assert 'alt="East of England Endoscopy Training Academy"' in html
        assert "Optical diagnosis accreditation" in html
        assert (
            "Sent by Quill Medical on behalf of East of England Endoscopy "
            "Training Academy." in html
        )
        assert rendered["from_name"] == "EoEETA via Quill Medical"
        assert rendered["reply_to"] == "coordinator@eoeeta.example"

    def test_partner_without_a_logo_shows_their_name(
        self, env: Environment
    ) -> None:
        partner = EmailPartner(
            name="Oncology Gloucestershire", context="Chemotherapy module"
        )
        rendered = _render(env, partner=partner)

        assert "Oncology Gloucestershire" in rendered["html_body"]
        assert (
            "<img" not in rendered["html_body"].split("Partner strip")[1][:400]
        )

    def test_partner_without_a_short_name_keeps_the_theme_sender(
        self, env: Environment
    ) -> None:
        partner = EmailPartner(name="A partner", context="A module")

        assert _render(env, partner=partner)["from_name"] == "Quill Medical"


class TestMistakesFailLoudly:
    def test_missing_value_fails(self, env: Environment) -> None:
        with pytest.raises(UndefinedError):
            render_email("sample.html.j2", "quill", {"name": "Sam"}, env=env)


def test_theme_colours_reach_the_email(env: Environment) -> None:
    html = _render(env, "quill")["html_body"]

    assert email_theme("quill").button_background in html
    assert email_theme("quill").panel in html
