# backend/app/email/brand.py
"""Brand values for email, read from ``shared/brand.yaml``.

The frontend's Mantine theme reads the same file, through the JSON that
``yarn generate:types`` makes from it, so an email and the app cannot
disagree about what the brand navy is.

Read and validated once at import. A misspelt field, a missing colour or a
palette reference to a shade that does not exist fails when the backend
starts, not in somebody's inbox.

**Colour references.** A colour in an email theme is a hex value or a
reference such as ``"primary.8"``, shade 8 of the primary ramp. Every
reference is resolved here, at load, so the rest of the backend only ever
sees hex values. ``frontend/src/lib/brand/brandPalette.ts`` resolves them
the same way.
"""

import re
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.paths import SHARED_DIR

BRAND_YAML_PATH: Path = SHARED_DIR / "brand.yaml"

EmailThemeName = Literal["quill", "ldd"]

_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
_REFERENCE = re.compile(r"^(primary|secondary|grey)\.(\d)$")


class _Strict(BaseModel):
    """Refuse unknown fields, so a misspelt key fails rather than vanishes."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class BrandColours(_Strict):
    """The three brand colours the app's CSS variables are built from."""

    primary: str
    secondary: str
    background: str


class Palette(_Strict):
    """The colour ramps, lightest first.

    Attributes:
        primary: Navy, ten shades; shade 8 is the brand primary.
        secondary: Amber, ten shades; shade 5 is the brand secondary.
        grey: Mantine's gray defaults, eight shades.
    """

    primary: list[str] = Field(min_length=10, max_length=10)
    secondary: list[str] = Field(min_length=10, max_length=10)
    grey: list[str] = Field(min_length=8, max_length=8)

    def resolve(self, value: str) -> str:
        """Turn a hex value or a palette reference into a hex value.

        Args:
            value: ``"#343a40"`` or ``"primary.8"``.

        Returns:
            The hex value.

        Raises:
            ValueError: If *value* is neither, or names a shade the ramp
                does not have.
        """
        if _HEX.match(value):
            return value
        match = _REFERENCE.match(value)
        if match is None:
            raise ValueError(f"Not a colour or a palette reference: {value!r}")
        ramp: list[str] = getattr(self, match.group(1))
        shade = int(match.group(2))
        if shade >= len(ramp):
            raise ValueError(
                f"No shade {shade} in the {match.group(1)} palette"
            )
        return ramp[shade]


class EmailFont(_Strict):
    """A Google Fonts family and the styles to load."""

    family: str
    axes: str


class EmailImage(_Strict):
    """An image at its display size; the file itself is twice that."""

    src: str
    width: int
    height: int
    alt: str


class EmailDarkTheme(_Strict):
    """The colours a mail client that honours dark mode shows instead."""

    background: str
    card: str
    header: str
    border: str
    text: str
    muted: str
    link: str
    panel: str
    footer: str


#: The fields of a theme that hold a colour, and so are resolved at load.
_COLOUR_FIELDS: tuple[str, ...] = (
    "heading_accent",
    "background",
    "card",
    "card_border",
    "border",
    "header",
    "header_rule",
    "heading",
    "text",
    "muted",
    "link",
    "button_background",
    "button_text",
    "panel",
    "panel_border",
    "panel_text",
    "panel_heading",
    "panel_link",
    "footer_background",
    "footer_rule",
    "footer_text",
    "footer_link",
)


class EmailTheme(_Strict):
    """One brand's look for every email.

    Field by field, the values the Phase 1 mock-ups were signed off with;
    ``shared/brand.yaml`` notes the reason for each.
    """

    sender_name: str
    fonts: list[EmailFont]
    font_family: str
    heading_font_family: str
    heading_weight: int
    h1_size: str
    h2_size: str
    heading_accent: str
    background: str
    card: str
    card_border: str
    border: str
    header: str
    header_rule_width: str
    header_rule: str
    header_logo: EmailImage
    header_name: str | None = None
    heading: str
    text: str
    muted: str
    link: str
    button_background: str
    button_text: str
    button_radius: str
    panel: str
    panel_border: str
    panel_text: str
    panel_heading: str
    panel_link: str
    footer_background: str
    footer_rule: str
    footer_text: str
    footer_link: str
    avatar: str
    newsletter_reason: str
    dark: EmailDarkTheme

    def resolved(self, palette: Palette) -> "EmailTheme":
        """This theme with every colour reference turned into hex.

        Args:
            palette: The ramps the references point into.

        Returns:
            A copy holding only hex values.

        Raises:
            ValueError: If any colour does not resolve.
        """
        updates: dict[str, Any] = {
            name: palette.resolve(getattr(self, name))
            for name in _COLOUR_FIELDS
        }
        updates["dark"] = self.dark.model_copy(
            update={
                name: palette.resolve(getattr(self.dark, name))
                for name in EmailDarkTheme.model_fields
            }
        )
        return self.model_copy(update=updates)


class BrandFile(_Strict):
    """The whole of ``shared/brand.yaml``, with every colour resolved."""

    brand: BrandColours
    palette: Palette
    email_themes: dict[EmailThemeName, EmailTheme]

    @model_validator(mode="after")
    def _resolve_colours(self) -> "BrandFile":
        """Resolve every theme's colours, so a bad reference fails here.

        Returns:
            The model, with resolved themes.

        Raises:
            ValueError: If a theme is missing or a colour does not
                resolve.
        """
        for name in ("quill", "ldd"):
            if name not in self.email_themes:
                raise ValueError(f"No email theme {name!r} in brand.yaml")
        resolved = {
            name: theme.resolved(self.palette)
            for name, theme in self.email_themes.items()
        }
        # Frozen, so the resolved themes go in through object.__setattr__
        # rather than a field assignment pydantic would refuse.
        object.__setattr__(self, "email_themes", resolved)
        return self


def load_brand(path: Path) -> BrandFile:
    """Read and validate the brand file at *path*.

    Args:
        path: The YAML file, normally :data:`BRAND_YAML_PATH`.

    Returns:
        The brand values, with every email colour resolved to hex.

    Raises:
        ValueError: If the file is empty or anything in it is invalid.
    """
    with open(path) as f:
        data: Any = yaml.safe_load(f)
    if not data:
        raise ValueError(f"{path} is empty")
    return BrandFile(**data)


BRAND: BrandFile = load_brand(BRAND_YAML_PATH)


def email_theme(name: EmailThemeName) -> EmailTheme:
    """The resolved email theme called *name*.

    Args:
        name: ``"quill"`` or ``"ldd"``.

    Returns:
        The theme, holding only hex colours.
    """
    return BRAND.email_themes[name]
