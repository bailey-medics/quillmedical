"""Brand values for email, read from shared/brand.yaml."""

import re
from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from app.email.brand import (
    BRAND,
    BRAND_YAML_PATH,
    EmailTheme,
    email_theme,
    load_brand,
)

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def _write_brand(tmp_path: Path, data: dict[str, object]) -> Path:
    path = tmp_path / "brand.yaml"
    path.write_text(yaml.safe_dump(data, allow_unicode=True))
    return path


def _brand_data() -> dict[str, object]:
    data: dict[str, object] = yaml.safe_load(BRAND_YAML_PATH.read_text())
    return data


class TestTheRealFile:
    def test_loads_both_themes(self) -> None:
        assert set(BRAND.email_themes) == {"quill", "ldd"}

    @pytest.mark.parametrize("name", ["quill", "ldd"])
    def test_every_colour_is_hex_after_loading(self, name: str) -> None:
        theme = email_theme(name)  # type: ignore[arg-type]
        colours = [
            getattr(theme, field)
            for field in (
                "heading_accent",
                "background",
                "card",
                "card_border",
                "header",
                "header_rule",
                "heading",
                "text",
                "muted",
                "link",
                "button_background",
                "button_text",
                "panel",
                "footer_background",
                "footer_text",
            )
        ]
        colours += list(theme.dark.model_dump().values())
        for colour in colours:
            assert HEX.match(colour), colour

    def test_resolves_palette_references(self) -> None:
        quill = email_theme("quill")
        # header is "primary.8" and header_rule "secondary.5" in the YAML
        assert quill.header == "#001a36"
        assert quill.header_rule == "#c8963e"
        assert quill.card_border == BRAND.palette.grey[4]

    def test_brand_primary_is_shade_8_of_the_navy_ramp(self) -> None:
        assert BRAND.palette.primary[8] == BRAND.brand.primary

    def test_the_mark_is_a_light_grey_outside_the_grey_ramp(self) -> None:
        # The quill on the email avatar and the app icon. A mark on navy,
        # not a surface on white, so it is deliberately not a ramp shade.
        assert HEX.match(BRAND.brand.mark)
        assert BRAND.brand.mark not in BRAND.palette.grey

    def test_keeps_hex_values_that_are_not_in_the_palette(self) -> None:
        assert email_theme("ldd").link == "#0848a9"


class TestAMistakeFailsAtLoad:
    def test_refuses_a_shade_the_palette_lacks(self, tmp_path: Path) -> None:
        data = _brand_data()
        data["email_themes"]["quill"]["header"] = "grey.9"  # type: ignore[index]
        with pytest.raises(ValidationError, match="No shade 9"):
            load_brand(_write_brand(tmp_path, data))

    def test_refuses_a_malformed_colour(self, tmp_path: Path) -> None:
        data = _brand_data()
        data["email_themes"]["ldd"]["link"] = "blue"  # type: ignore[index]
        with pytest.raises(ValidationError, match="Not a colour"):
            load_brand(_write_brand(tmp_path, data))

    def test_refuses_a_misspelt_field(self, tmp_path: Path) -> None:
        data = _brand_data()
        data["email_themes"]["quill"]["header_colour"] = "#ffffff"  # type: ignore[index]
        with pytest.raises(ValidationError, match="header_colour"):
            load_brand(_write_brand(tmp_path, data))

    def test_refuses_a_ramp_of_the_wrong_length(self, tmp_path: Path) -> None:
        data = _brand_data()
        data["palette"]["primary"] = data["palette"]["primary"][:9]  # type: ignore[index]
        with pytest.raises(ValidationError):
            load_brand(_write_brand(tmp_path, data))

    def test_refuses_a_missing_theme(self, tmp_path: Path) -> None:
        data = _brand_data()
        del data["email_themes"]["ldd"]  # type: ignore[attr-defined]
        with pytest.raises(ValidationError, match="No email theme 'ldd'"):
            load_brand(_write_brand(tmp_path, data))


def test_resolved_themes_are_still_email_themes() -> None:
    assert isinstance(email_theme("ldd"), EmailTheme)
