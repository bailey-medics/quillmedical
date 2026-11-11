"""Brand values for email, read from ``shared/brand.yaml``.

**Two things are in that file, and they are not the same kind of thing.**

- **The Quill app's own colours**: ``BrandColours`` and ``Palette``. One
  set, because there is one app, and it is always Quill. The frontend
  builds its styling from them. Nothing here is per brand.
- **The email themes**, one for each brand an email can go out as:
  ``EmailTheme``, keyed by ``EmailThemeName``, ``"quill"`` or ``"ldd"``
  for Let's Do Digital. This is what a template sees as ``t``. Let's Do
  Digital exists only here, because email is the only place it appears.

So a new brand is a new email theme. It adds nothing to the app's
colours.

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
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.email.theme import EMAIL_THEME_NAMES, EmailThemeName
from app.paths import SHARED_DIR

BRAND_YAML_PATH: Path = SHARED_DIR / "brand.yaml"

_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
_REFERENCE = re.compile(r"^(primary|secondary|grey)\.(\d)$")


class _Strict(BaseModel):
    """Refuse unknown fields, so a misspelt key fails rather than vanishes."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class BrandColours(_Strict):
    """The app's brand colours, which its CSS variables are built from.

    The app ships as Quill, and the top-level set is Quill's. An entry
    in ``app_themes`` carries its own set, for the app shown in another
    brand's look. A brand an email goes out as has an ``EmailTheme``,
    which is separate from these.

    ``mark`` is the colour of the logo's symbol, the quill, as drawn on
    a navy tile for the email avatar and the app icon. The rest are the app's
    own surfaces.
    """

    primary: str
    secondary: str
    background: str
    mark: str


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


def _check_hex(value: str) -> str:
    """Refuse anything but a six-digit hex colour.

    Args:
        value: The colour as written in the file.

    Returns:
        The colour, unchanged.

    Raises:
        ValueError: If *value* is not ``#`` and six hex digits.
    """
    if not _HEX.match(value):
        raise ValueError(f"Not a hex colour: {value!r}")

    return value


class AppBrandColours(BrandColours):
    """An app theme's brand colours, each a hex value."""

    @model_validator(mode="after")
    def _all_hex(self) -> AppBrandColours:
        """Refuse a colour that is not hex, since nothing resolves it.

        Returns:
            The model, unchanged.
        """
        for name in BrandColours.model_fields:
            _check_hex(getattr(self, name))

        return self


class AppPalette(_Strict):
    """An app theme's two ramps, lightest first, each a hex value.

    The grey ramp is not here: it is Mantine's neutral greys, shared by
    every theme.

    Attributes:
        primary: Ten shades; shade 5 is the filled-button colour.
        secondary: Ten shades.
    """

    primary: list[str] = Field(min_length=10, max_length=10)
    secondary: list[str] = Field(min_length=10, max_length=10)

    @model_validator(mode="after")
    def _all_hex(self) -> AppPalette:
        """Refuse a shade that is not a hex colour.

        Returns:
            The model, unchanged.
        """
        for shade in [*self.primary, *self.secondary]:
            _check_hex(shade)

        return self


class Identity(_Strict):
    """What one brand calls itself.

    Attributes:
        name: The full name, for page titles, and the name every commit
            the app makes is committed under. The author of a commit is
            always the person who acted.
        short_name: The name where room is short, such as under a home
            screen icon.
        committer_email: The address commits are made from, never a
            person's.
    """

    name: str = Field(min_length=1)
    short_name: str = Field(min_length=1)
    committer_email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Wordmark(_Strict):
    """A brand's name drawn as an image, for the app's top ribbon.

    Attributes:
        src: The image's path under ``frontend/public``, white, for the
            ribbon.
        dark_src: The same name drawn dark, for a light background.
            Unset shows the white one there too.
        alt: What a screen reader says for it, such as
            ``"Let's Do Digital"``.
    """

    src: str = Field(pattern=r"^/\S+$")
    dark_src: str | None = Field(default=None, pattern=r"^/\S+$")
    alt: str = Field(min_length=1)


class AppTheme(_Strict):
    """Another look for the app, beside Quill's own.

    Nothing in the backend reads it beyond checking it here, so a
    mistake in the file fails when the backend starts rather than in
    the browser.

    Attributes:
        identity: What the brand calls itself, and its committer address.
        brand: The brand colours.
        palette: The primary and secondary ramps.
        ribbon_icon_idle: The ribbon's mail icon while nothing waits.
        link: Links in light mode.
        logo: The logo's path under ``frontend/public``.
        logo_tile: The colour of a tile drawn behind the logo, for a logo
            that would be lost on the brand's own colours. Unset draws
            the logo as it is.
        wordmark: The name, drawn as an image.
    """

    identity: Identity
    brand: AppBrandColours
    palette: AppPalette
    ribbon_icon_idle: str
    link: str
    logo: str = Field(pattern=r"^/\S+$")
    logo_tile: str | None = None
    wordmark: Wordmark

    @model_validator(mode="after")
    def _colours_are_hex(self) -> AppTheme:
        """Refuse a ribbon icon, link or logo tile colour that is not hex.

        Returns:
            The model, unchanged.
        """
        _check_hex(self.ribbon_icon_idle)
        _check_hex(self.link)

        if self.logo_tile is not None:
            _check_hex(self.logo_tile)

        return self


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

    Every email shares one layout, and a theme is what differs between
    brands: the colours, the fonts, the logo and the names. Each field
    below is one of those values, and ``shared/brand.yaml`` notes the
    reason for each where it is set.

    The values are the ones Mark approved when the emails were designed.
    Storybook's Foundations/Emails stories show every email in each
    theme, so that is where to look before changing one.
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

    def resolved(self, palette: Palette) -> EmailTheme:
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

    identity: Identity
    brand: BrandColours
    palette: Palette
    app_themes: dict[str, AppTheme]
    email_themes: dict[EmailThemeName, EmailTheme]

    @model_validator(mode="after")
    def _resolve_colours(self) -> BrandFile:
        """Resolve every theme's colours, so a bad reference fails here.

        Returns:
            The model, with resolved themes.

        Raises:
            ValueError: If a theme is missing or a colour does not
                resolve.
        """
        for name in EMAIL_THEME_NAMES:
            if name not in self.email_themes:
                raise ValueError(
                    f"No email theme {name!r} in brand.yaml. The names in "
                    "app/email/theme.py are generated from that file: run "
                    "`just email-themes`"
                )

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


#: The name the app's own look goes by. Every other brand is a key of
#: ``app_themes``.
QUILL = "quill"


def brand_names() -> tuple[str, ...]:
    """Every brand the app can run as: Quill, then each app theme.

    Returns:
        The names, ``"quill"`` first, as ``BRAND`` may be set to.
    """
    return (QUILL, *BRAND.app_themes)


def identity(name: str) -> Identity:
    """What the brand called *name* calls itself.

    Args:
        name: ``"quill"``, or a key of ``app_themes``.

    Returns:
        The brand's identity.

    Raises:
        ValueError: If *name* is not a brand.
    """
    if name == QUILL:
        return BRAND.identity

    if name not in BRAND.app_themes:
        raise ValueError(
            f"Unknown brand {name!r}. Known brands: "
            f"{', '.join(brand_names())}"
        )

    return BRAND.app_themes[name].identity


def email_theme(name: EmailThemeName) -> EmailTheme:
    """The resolved email theme called *name*.

    Args:
        name: ``"quill"`` or ``"ldd"``.

    Returns:
        The theme, holding only hex colours.
    """
    return BRAND.email_themes[name]
