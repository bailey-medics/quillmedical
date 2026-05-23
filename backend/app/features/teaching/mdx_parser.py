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


@dataclass
class ParsedSlide:
    """A single slide parsed from MDX content."""

    slide_index: int
    layout: str  # "section-title" | "default" | "video-slide"
    title: str
    body: str | None = None
    callout_type: str | None = None
    callout_body: str | None = None
    youtube_id: str | None = None
    duration_seconds: int | None = None


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
    pattern = r'<Callout\s+type="(\w+)">\s*(.*?)\s*</Callout>'
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
    pattern = r'<YouTube\s+id="([^"]+)"' r"(?:\s+duration=\{(\d+)\})?" r"\s*/>"
    match = re.search(pattern, body)
    if not match:
        return body, None, None

    youtube_id = match.group(1)
    duration = int(match.group(2)) if match.group(2) else None
    remaining = body[: match.start()] + body[match.end() :]
    remaining = remaining.strip()
    return remaining, youtube_id, duration


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

        if body_text:
            body_text, callout_type, callout_body = _extract_callout(body_text)
            body_text_check = body_text or ""
            body_text_check, youtube_id, duration_seconds = _extract_youtube(
                body_text_check
            )
            if youtube_id:
                layout = "video-slide"
                body_text = body_text_check or None
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
