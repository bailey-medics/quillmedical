"""Tests for the MDX parser module."""

from pathlib import Path

from app.features.teaching.mdx_parser import (
    load_learning_content,
    load_module_yaml,
    parse_mdx_to_slides,
)


class TestParseMdxToSlides:
    """parse_mdx_to_slides converts MDX to slide structures."""

    def test_simple_h1_creates_section_title(self) -> None:
        content = "# My Title\n"
        slides = parse_mdx_to_slides(content)
        assert len(slides) == 1
        assert slides[0].layout == "section-title"
        assert slides[0].title == "My Title"
        assert slides[0].body is None

    def test_h2_creates_default_slide(self) -> None:
        content = "## Subtitle\n\nSome body text here."
        slides = parse_mdx_to_slides(content)
        assert len(slides) == 1
        assert slides[0].layout == "default"
        assert slides[0].title == "Subtitle"
        assert slides[0].body == "Some body text here."

    def test_multiple_headings_create_multiple_slides(self) -> None:
        content = (
            "# Section One\n\n"
            "## Point A\n\nBody A\n\n"
            "## Point B\n\nBody B\n\n"
            "# Summary\n"
        )
        slides = parse_mdx_to_slides(content)
        assert len(slides) == 4
        assert slides[0].title == "Section One"
        assert slides[0].layout == "section-title"
        assert slides[1].title == "Point A"
        assert slides[1].body == "Body A"
        assert slides[2].title == "Point B"
        assert slides[2].body == "Body B"
        assert slides[3].title == "Summary"
        assert slides[3].layout == "section-title"

    def test_sequential_indices(self) -> None:
        content = "# A\n\n## B\n\n## C\n"
        slides = parse_mdx_to_slides(content)
        for i, slide in enumerate(slides):
            assert slide.slide_index == i

    def test_frontmatter_stripped(self) -> None:
        content = "---\nmoduleId: test\n---\n\n# Title\n"
        slides = parse_mdx_to_slides(content)
        assert len(slides) == 1
        assert slides[0].title == "Title"

    def test_callout_extracted(self) -> None:
        content = (
            "## Key point\n\n"
            '<Callout type="warning">\n'
            "  Important safety note.\n"
            "</Callout>\n"
        )
        slides = parse_mdx_to_slides(content)
        assert len(slides) == 1
        assert slides[0].callout_type == "warning"
        assert slides[0].callout_body == "Important safety note."

    def test_callout_with_surrounding_body(self) -> None:
        content = (
            "## Mixed\n\n"
            "Before text.\n\n"
            '<Callout type="info">\n'
            "  Note here.\n"
            "</Callout>\n\n"
            "After text.\n"
        )
        slides = parse_mdx_to_slides(content)
        assert slides[0].callout_type == "info"
        assert slides[0].callout_body == "Note here."
        assert "Before text." in (slides[0].body or "")

    def test_empty_content(self) -> None:
        slides = parse_mdx_to_slides("")
        assert slides == []

    def test_body_with_markdown_formatting(self) -> None:
        content = "## Formatted\n\n- **Bold** item\n- *Italic* item\n"
        slides = parse_mdx_to_slides(content)
        assert "**Bold**" in (slides[0].body or "")

    def test_youtube_creates_video_slide(self) -> None:
        content = (
            '## Recorded lecture\n\n<YouTube id="abc123" duration={600} />\n'
        )
        slides = parse_mdx_to_slides(content)
        assert len(slides) == 1
        assert slides[0].layout == "video-slide"
        assert slides[0].youtube_id == "abc123"
        assert slides[0].duration_seconds == 600
        assert slides[0].title == "Recorded lecture"

    def test_youtube_without_duration(self) -> None:
        content = '## Watch this\n\n<YouTube id="xyz789" />\n'
        slides = parse_mdx_to_slides(content)
        assert slides[0].layout == "video-slide"
        assert slides[0].youtube_id == "xyz789"
        assert slides[0].duration_seconds is None

    def test_youtube_with_surrounding_body(self) -> None:
        content = (
            "## Video section\n\n"
            "Watch this lecture.\n\n"
            '<YouTube id="vid1" duration={120} />\n'
        )
        slides = parse_mdx_to_slides(content)
        assert slides[0].layout == "video-slide"
        assert slides[0].youtube_id == "vid1"
        assert "Watch this lecture." in (slides[0].body or "")

    def test_figure_creates_text_with_figure_slide(self) -> None:
        content = (
            "## Diagram\n\n"
            "Some text.\n\n"
            '<Figure src="diagram.png" alt="A diagram" '
            'caption="Figure 1" />\n'
        )
        slides = parse_mdx_to_slides(content)
        assert len(slides) == 1
        assert slides[0].layout == "text-with-figure"
        assert slides[0].figure_src == "diagram.png"
        assert slides[0].figure_alt == "A diagram"
        assert slides[0].figure_caption == "Figure 1"
        assert slides[0].figure_position == "below"
        assert slides[0].body == "Some text."

    def test_figure_without_caption(self) -> None:
        content = "## Image\n\n" '<Figure src="img.png" alt="An image" />\n'
        slides = parse_mdx_to_slides(content)
        assert slides[0].layout == "text-with-figure"
        assert slides[0].figure_src == "img.png"
        assert slides[0].figure_alt == "An image"
        assert slides[0].figure_caption is None
        assert slides[0].figure_position == "above"

    def test_figure_position_above(self) -> None:
        content = (
            "## Top image\n\n"
            '<Figure src="top.png" alt="Top" caption="At top" />\n\n'
            "Body text below the figure.\n"
        )
        slides = parse_mdx_to_slides(content)
        assert slides[0].figure_position == "above"
        assert slides[0].body == "Body text below the figure."

    def test_figure_with_callout(self) -> None:
        content = (
            "## Mixed\n\n"
            '<Figure src="pic.png" alt="Pic" caption="Cap" />\n\n'
            '<Callout type="info">\n  Note.\n</Callout>\n'
        )
        slides = parse_mdx_to_slides(content)
        assert slides[0].layout == "text-with-figure"
        assert slides[0].figure_src == "pic.png"
        assert slides[0].callout_type == "info"
        assert slides[0].callout_body == "Note."


class TestLoadModuleYaml:
    """load_module_yaml reads module.yaml metadata."""

    def test_loads_valid_yaml(self, tmp_path: Path) -> None:
        (tmp_path / "module.yaml").write_text(
            "moduleId: test-module\ntitle: Test\norder: 1\nstatus: live\n"
        )
        meta = load_module_yaml(tmp_path)
        assert meta["moduleId"] == "test-module"
        assert meta["title"] == "Test"
        assert meta["order"] == 1

    def test_missing_file_returns_empty(self, tmp_path: Path) -> None:
        meta = load_module_yaml(tmp_path)
        assert meta == {}


class TestLoadLearningContent:
    """load_learning_content reads and parses content.mdx."""

    def test_loads_and_parses(self, tmp_path: Path) -> None:
        learning_dir = tmp_path / "learning"
        learning_dir.mkdir()
        (learning_dir / "content.mdx").write_text(
            "---\nmoduleId: test\n---\n\n# Intro\n\n## Topic\n\nBody.\n"
        )
        slides = load_learning_content(tmp_path)
        assert len(slides) == 2
        assert slides[0].title == "Intro"
        assert slides[1].title == "Topic"
        assert slides[1].body == "Body."

    def test_missing_file_returns_empty(self, tmp_path: Path) -> None:
        slides = load_learning_content(tmp_path)
        assert slides == []
