"""MDX validation, checked against what the parser can actually render.

Replaces ``teaching-tooling/scripts/validate_mdx.js``. That validator
compiled with ``@mdx-js/mdx`` and asked "is this valid MDX?" — a question
nothing in Quill needs answered, since the frontend has no MDX compiler and
receives slides already parsed by ``mdx_parser``.

The question that matters is "will the parser find this?", because anything
its extractors miss vanishes from the slide with no error. Each test in
``TestSilentlyDroppedContent`` pairs a validation failure with proof that
the parser really would have dropped it.
"""

from __future__ import annotations

import pytest

from app.features.teaching.mdx_parser import (
    KNOWN_COMPONENTS,
    NOT_YET_SUPPORTED,
    VALID_CALLOUT_TYPES,
    parse_mdx_to_slides,
    validate_mdx,
)


class TestValidContent:
    def test_minimal_document_passes(self) -> None:
        assert validate_mdx("## A slide\n\nSome body text.") == []

    def test_section_and_slide_headings_pass(self) -> None:
        content = "# Section\n\n## Slide\n\nBody."
        assert validate_mdx(content) == []

    def test_all_supported_components_pass(self) -> None:
        content = (
            "## Slide\n"
            '<Callout type="info">Note this.</Callout>\n'
            '<YouTube id="abc123" duration={60} />\n'
            '<Figure src="x.png" alt="A thing" caption="Cap" />\n'
        )
        assert validate_mdx(content) == []

    def test_frontmatter_is_ignored(self) -> None:
        content = "---\ntitle: Something\n---\n\n## Slide\n\nBody."
        assert validate_mdx(content) == []

    def test_lowercase_html_tags_are_not_components(self) -> None:
        assert validate_mdx("## Slide\n\n<em>emphasis</em>") == []


class TestStructure:
    def test_empty_file_is_reported(self) -> None:
        assert validate_mdx("") == ["file is empty"]

    def test_frontmatter_only_counts_as_empty(self) -> None:
        assert validate_mdx("---\ntitle: x\n---\n") == ["file is empty"]

    def test_content_without_headings_is_reported(self) -> None:
        errors = validate_mdx("Just prose, no heading anywhere.")
        assert any("no slides found" in e for e in errors)


class TestSilentlyDroppedContent:
    """The cases that motivated replacing the Node validator.

    Each asserts twice: that validation catches it, and that the parser
    really would have discarded it without complaint.
    """

    def test_youtube_with_an_unsupported_prop(self) -> None:
        content = '## Slide\n<YouTube id="abc" title="Extra" />'

        errors = validate_mdx(content)
        assert any("YouTube" in e for e in errors)

        # Proof it would vanish: the parser finds no video.
        assert parse_mdx_to_slides(content)[0].youtube_id is None

    def test_figure_that_is_not_self_closing(self) -> None:
        content = '## Slide\n<Figure src="a.png" alt="A">'

        errors = validate_mdx(content)
        assert any("self-closing" in e for e in errors)

        assert parse_mdx_to_slides(content)[0].figure_src is None

    def test_unclosed_callout(self) -> None:
        content = '## Slide\n<Callout type="info">Important'

        errors = validate_mdx(content)
        assert any("not closed" in e for e in errors)

        assert parse_mdx_to_slides(content)[0].callout_type is None

    def test_video_component_is_rejected_with_a_forward_pointing_message(
        self,
    ) -> None:
        """``<Video>`` was valid to the Node validator but never renders.

        Nothing in the stack reads it — no extractor, no ParsedSlide field,
        no frontend mapping — so content following the old validator passed
        CI and showed a blank slide. Hosted video is planned, so the error
        says so rather than calling the name unknown.
        """
        content = '## Slide\n<Video src="clip.mp4" />'

        errors = validate_mdx(content)
        assert any("not implemented yet" in e for e in errors)
        assert any("YouTube" in e for e in errors)
        assert "Video" not in KNOWN_COMPONENTS
        assert "Video" in NOT_YET_SUPPORTED


class TestComponentProps:
    def test_callout_without_a_type(self) -> None:
        errors = validate_mdx("## Slide\n<Callout>Body</Callout>")
        assert any("needs a type prop" in e for e in errors)

    @pytest.mark.parametrize("bad_type", ["danger", "error", "note"])
    def test_callout_with_a_type_that_never_renders(
        self, bad_type: str
    ) -> None:
        content = f'## Slide\n<Callout type="{bad_type}">Body</Callout>'
        errors = validate_mdx(content)
        assert any("not a valid type" in e for e in errors)

    @pytest.mark.parametrize("good_type", VALID_CALLOUT_TYPES)
    def test_every_supported_callout_type_passes(self, good_type: str) -> None:
        content = f'## Slide\n<Callout type="{good_type}">Body</Callout>'
        assert validate_mdx(content) == []

    def test_youtube_without_an_id(self) -> None:
        errors = validate_mdx("## Slide\n<YouTube />")
        assert any("needs an id prop" in e for e in errors)

    def test_figure_without_a_src(self) -> None:
        errors = validate_mdx('## Slide\n<Figure alt="A thing" />')
        assert any("needs a src prop" in e for e in errors)

    def test_figure_without_an_alt_is_an_accessibility_failure(self) -> None:
        errors = validate_mdx('## Slide\n<Figure src="a.png" />')
        assert any("alt prop" in e for e in errors)
        assert any("accessibility" in e for e in errors)


class TestErrorMessages:
    def test_errors_carry_a_line_number(self) -> None:
        content = "## Slide\n\n\n<Unknown />"
        errors = validate_mdx(content)
        assert any(e.startswith("line 4:") for e in errors)

    def test_unknown_component_lists_what_is_supported(self) -> None:
        errors = validate_mdx("## Slide\n<Sidebar />")
        assert any("Callout, YouTube, Figure" in e for e in errors)


class TestParserAndValidatorAgree:
    """The validator must be driven by the parser's own patterns."""

    def test_planned_components_are_not_also_advertised_as_known(
        self,
    ) -> None:
        assert not set(NOT_YET_SUPPORTED) & set(KNOWN_COMPONENTS)

    def test_known_components_are_the_ones_with_extractors(self) -> None:
        from app.features.teaching import mdx_parser

        for name in KNOWN_COMPONENTS:
            assert hasattr(mdx_parser, f"_extract_{name.lower()}"), (
                f"{name} is advertised as known but has no extractor — "
                "content using it would be silently dropped"
            )

    def test_anything_valid_round_trips_through_the_parser(self) -> None:
        content = (
            "## Slide\n"
            '<Callout type="warning">Careful.</Callout>\n'
            '<YouTube id="xyz789" />\n'
        )
        assert validate_mdx(content) == []

        slide = parse_mdx_to_slides(content)[0]
        assert slide.callout_type == "warning"
        assert slide.youtube_id == "xyz789"
