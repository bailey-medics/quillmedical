"""Parse learning content.mdx files into slide structures.

The MDX format uses ``#`` headings as slide group separators and
``##`` headings as individual slide titles. Content between headings
becomes the slide body. Special components like ``<Callout>`` are
recognised and converted to callout metadata.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

#: Components the parser can actually turn into slide metadata.
#: Anything else is dropped, so the validator must reject it.
KNOWN_COMPONENTS = ("Callout", "YouTube", "Figure")

#: Callout styles the frontend renders.
VALID_CALLOUT_TYPES = ("info", "warning", "success")

#: Recognised names that cannot be rendered yet. Authors get a clearer
#: error than "unknown component", and anything listed here is a reminder
#: that the extractor, ``ParsedSlide`` and the frontend must all land
#: together before the name moves into ``KNOWN_COMPONENTS``.
NOT_YET_SUPPORTED = {
    "Video": (
        "hosted video is not implemented yet — nothing in the parser, "
        'ParsedSlide or the frontend reads it. Use <YouTube id="..." /> '
        "until it lands"
    ),
}

#: The exact patterns the extractors below match. A component-shaped tag
#: that fails its pattern is silently discarded at render time, which is
#: precisely what ``validate_mdx`` exists to catch.
CALLOUT_PATTERN = r'<Callout\s+type="(\w+)">\s*(.*?)\s*</Callout>'
YOUTUBE_PATTERN = (
    r'<YouTube\s+id="([^"]+)"' r"(?:\s+duration=\{(\d+)\})?" r"\s*/>"
)
FIGURE_PATTERN = r"<Figure\s+([^>]*)/>"

#: Any JSX-style tag whose name starts with a capital letter.
_COMPONENT_TAG_RE = re.compile(r"<([A-Z]\w*)(\s[^>]*)?/?>")

#: Markdown headings that start a slide.
_HEADING_RE = re.compile(r"^#{1,2}\s+.+", re.MULTILINE)


@dataclass
class ParsedSlide:
    """A single slide parsed from MDX content."""

    slide_index: int
    layout: (
        str  # "section-title" | "default" | "video-slide" | "text-with-figure"
    )
    title: str
    body: str | None = None
    callout_type: str | None = None
    callout_body: str | None = None
    youtube_id: str | None = None
    duration_seconds: int | None = None
    figure_src: str | None = None
    figure_alt: str | None = None
    figure_caption: str | None = None
    figure_position: str | None = None  # "above" | "below"


def _strip_frontmatter(content: str) -> str:
    """Remove YAML frontmatter from MDX content."""
    if content.startswith("---"):
        end = content.find("---", 3)
        if end != -1:
            return content[end + 3 :].strip()
    return content.strip()


def _extract_callout(body: str) -> tuple[str, str | None, str | None]:
    """Extract <Callout> component from body text.

    Returns (remaining_body, callout_type, callout_body).
    """
    pattern = CALLOUT_PATTERN
    match = re.search(pattern, body, re.DOTALL)
    if not match:
        return body, None, None

    callout_type = match.group(1)
    callout_body = match.group(2).strip()
    remaining = body[: match.start()] + body[match.end() :]
    remaining = remaining.strip()
    return remaining, callout_type, callout_body


def _extract_youtube(
    body: str,
) -> tuple[str, str | None, int | None]:
    """Extract <YouTube> component from body text.

    Supports both self-closing and explicit close forms:
      <YouTube id="abc123" />
      <YouTube id="abc123" duration={1080} />

    Returns (remaining_body, youtube_id, duration_seconds).
    """
    pattern = YOUTUBE_PATTERN
    match = re.search(pattern, body)
    if not match:
        return body, None, None

    youtube_id = match.group(1)
    duration = int(match.group(2)) if match.group(2) else None
    remaining = body[: match.start()] + body[match.end() :]
    remaining = remaining.strip()
    return remaining, youtube_id, duration


def _extract_figure(
    body: str,
) -> tuple[str, str | None, str | None, str | None, str | None]:
    """Extract <Figure> component from body text.

    Supports self-closing form:
      <Figure src="img.png" alt="description" caption="caption text" />

    Returns (remaining_body, src, alt, caption, position).
    Position is "above" if figure appears before body text, "below" otherwise.
    """
    pattern = FIGURE_PATTERN
    match = re.search(pattern, body)
    if not match:
        return body, None, None, None, None

    attrs = match.group(1)
    src_m = re.search(r'src="([^"]+)"', attrs)
    alt_m = re.search(r'alt="([^"]+)"', attrs)
    cap_m = re.search(r'caption="([^"]+)"', attrs)

    src = src_m.group(1) if src_m else None
    alt = alt_m.group(1) if alt_m else None
    caption = cap_m.group(1) if cap_m else None

    # Determine position: "above" if no text before the figure
    text_before = body[: match.start()].strip()
    position = "above" if not text_before else "below"

    remaining = body[: match.start()] + body[match.end() :]
    remaining = remaining.strip()
    return remaining, src, alt, caption, position


# ------------------------------------------------------------------
# Validation
# ------------------------------------------------------------------


def _check_component(name: str, tag: str) -> str | None:
    """Check one component tag, returning an error message or None.

    The test is not "is this valid MDX?" but "will the extractors above
    actually pick this up?".  A tag that looks right but misses its pattern
    is dropped at render time without a word, so it must fail here.
    """
    if name in NOT_YET_SUPPORTED:
        return f"<{name}>: {NOT_YET_SUPPORTED[name]}"

    if name not in KNOWN_COMPONENTS:
        known = ", ".join(KNOWN_COMPONENTS)
        return f"unknown component <{name}> (known: {known})"

    if name == "Callout":
        type_match = re.search(r'type="(\w+)"', tag)
        if not type_match:
            valid = ", ".join(VALID_CALLOUT_TYPES)
            return f"<Callout> needs a type prop ({valid})"
        if type_match.group(1) not in VALID_CALLOUT_TYPES:
            valid = ", ".join(VALID_CALLOUT_TYPES)
            return (
                f'<Callout type="{type_match.group(1)}"> is not a valid '
                f"type (must be: {valid})"
            )

    if name == "YouTube":
        if not re.search(r'id="[^"]+"', tag):
            return "<YouTube> needs an id prop"
        if not re.fullmatch(YOUTUBE_PATTERN, tag):
            return (
                "<YouTube> has props the renderer cannot read, so it would "
                "be dropped — only id and duration are supported"
            )

    if name == "Figure":
        if not re.search(r'src="[^"]+"', tag):
            return "<Figure> needs a src prop"
        if not re.search(r'alt="[^"]+"', tag):
            return "<Figure> needs an alt prop (accessibility)"
        if not re.fullmatch(FIGURE_PATTERN, tag):
            return (
                "<Figure> is not self-closing, so it would be dropped — "
                "write it as <Figure ... />"
            )

    return None


def validate_mdx(content: str) -> list[str]:
    """Validate learning MDX against what this parser can render.

    Returns human-readable error strings; empty when the content is sound.

    This deliberately checks what will render, rather than MDX syntax.  The
    frontend never compiles MDX — it receives slides parsed here — so
    "valid MDX" is not the useful question.  What matters is whether these
    extractors will find the components, because anything they miss
    disappears from the slide silently.
    """
    errors: list[str] = []

    stripped = _strip_frontmatter(content)
    if not stripped.strip():
        return ["file is empty"]

    if not _HEADING_RE.search(stripped):
        errors.append(
            "no slides found — content needs at least one '#' or '##' heading"
        )

    for line_number, line in enumerate(stripped.split("\n"), start=1):
        for match in _COMPONENT_TAG_RE.finditer(line):
            problem = _check_component(match.group(1), match.group(0))
            if problem:
                errors.append(f"line {line_number}: {problem}")

    # A Callout spans lines, so its close tag needs a whole-document check.
    opens_callout = re.search(r"<Callout\b[^>]*>", stripped) is not None
    completes_callout = (
        re.search(CALLOUT_PATTERN, stripped, re.DOTALL) is not None
    )
    if opens_callout and not completes_callout:
        errors.append(
            "<Callout> is not closed with </Callout>, so it would be dropped"
        )

    return errors


def parse_mdx_to_slides(content: str) -> list[ParsedSlide]:
    """Parse MDX content into a list of slides.

    Rules:
    - ``# Heading`` creates a section-title slide
    - ``## Heading`` creates a default slide; content below becomes body
    - ``<Callout type="...">`` in body becomes callout metadata
    - Empty sections (no body) still generate a slide
    """
    content = _strip_frontmatter(content)
    lines = content.split("\n")

    slides: list[ParsedSlide] = []
    current_title: str | None = None
    current_level: int = 0
    current_body_lines: list[str] = []

    def flush_slide() -> None:
        nonlocal current_title, current_body_lines, current_level
        if current_title is None:
            return

        body_text = "\n".join(current_body_lines).strip() or None
        layout = "section-title" if current_level == 1 else "default"

        callout_type = None
        callout_body = None
        youtube_id = None
        duration_seconds = None
        figure_src = None
        figure_alt = None
        figure_caption = None
        figure_position = None

        if body_text:
            body_text, callout_type, callout_body = _extract_callout(body_text)
            body_text_check = body_text or ""
            body_text_check, youtube_id, duration_seconds = _extract_youtube(
                body_text_check
            )
            if youtube_id:
                layout = "video-slide"
                body_text = body_text_check or None

            fig_text = body_text or ""
            (
                fig_text,
                figure_src,
                figure_alt,
                figure_caption,
                figure_position,
            ) = _extract_figure(fig_text)
            if figure_src:
                layout = "text-with-figure"
                body_text = fig_text or None

            if not body_text:
                body_text = None

        slides.append(
            ParsedSlide(
                slide_index=len(slides),
                layout=layout,
                title=current_title,
                body=body_text,
                callout_type=callout_type,
                callout_body=callout_body,
                youtube_id=youtube_id,
                duration_seconds=duration_seconds,
                figure_src=figure_src,
                figure_alt=figure_alt,
                figure_caption=figure_caption,
                figure_position=figure_position,
            )
        )
        current_title = None
        current_body_lines = []
        current_level = 0

    for line in lines:
        h1_match = re.match(r"^#\s+(.+)$", line)
        h2_match = re.match(r"^##\s+(.+)$", line)

        if h1_match:
            flush_slide()
            current_title = h1_match.group(1).strip()
            current_level = 1
        elif h2_match:
            flush_slide()
            current_title = h2_match.group(1).strip()
            current_level = 2
        elif current_title is not None:
            current_body_lines.append(line)

    # Flush the last slide
    flush_slide()

    return slides


def load_module_yaml(module_dir: Path) -> dict[str, Any]:
    """Load and return the module.yaml metadata."""
    path = module_dir / "module.yaml"
    if not path.is_file():
        return {}
    with open(path) as f:
        return yaml.safe_load(f) or {}


def load_learning_content(module_dir: Path) -> list[ParsedSlide]:
    """Load and parse learning/content.mdx from a module directory."""
    content_path = module_dir / "learning" / "content.mdx"
    if not content_path.is_file():
        return []
    content = content_path.read_text(encoding="utf-8")
    return parse_mdx_to_slides(content)
