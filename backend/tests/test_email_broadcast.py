"""The newsletter layout, exported as a Resend broadcast template."""

import re

import pytest

from app.email.broadcast import RESEND_UNSUBSCRIBE_URL, export, main


@pytest.mark.parametrize("theme", ["quill", "ldd"])
def test_carries_resends_unsubscribe_placeholder_untouched(theme: str) -> None:
    html = export(theme)  # type: ignore[arg-type]

    assert f'href="{RESEND_UNSUBSCRIBE_URL}"' in html


@pytest.mark.parametrize("theme", ["quill", "ldd"])
def test_every_image_is_a_live_url(theme: str) -> None:
    html = export(theme)  # type: ignore[arg-type]
    sources = re.findall(r'src="([^"]+)"', html)

    assert sources
    assert all(s.startswith("https://") for s in sources), sources


def test_marks_where_the_campaign_goes() -> None:
    html = export("quill")

    assert "CAMPAIGN CONTENT" in html
    assert "END CAMPAIGN CONTENT" in html


def test_each_theme_brings_its_own_look() -> None:
    assert "Cormorant Garamond" in export("quill")
    assert "Let’s Do Digital" in export("ldd")


def test_the_footer_names_the_company_and_address() -> None:
    html = export("quill")

    assert "Company number 15604352" in html
    assert "M33 3SD" in html


def test_refuses_an_unknown_theme(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["purple"]) == 1
    assert "Usage" in capsys.readouterr().err
