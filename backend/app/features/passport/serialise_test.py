"""Tests for app/features/passport/serialise.py.

A passport is meant to be readable years later with nothing but a text
editor, so these tests are as much about the shape of the output as
about round-tripping. A file that parses correctly but reads badly has
failed at the thing the format was chosen for.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.features.passport import schemas, serialise
from app.features.passport.serialise import RecordFormatError


class TestReadability:
    def test_a_comment_says_what_the_file_is(self) -> None:
        """Somebody opening it should know before reading a field."""
        rendered = serialise.to_yaml(
            schemas.LogbookEntry(performed_on=date(2026, 3, 12)),
            comment="One logged procedure.",
        )

        assert rendered.startswith("# One logged procedure.\n")

    def test_keys_keep_the_order_the_model_declares(self) -> None:
        """Not alphabetical: the model's order is reading order.

        Deliberately the opposite of the canonical form used for
        hashing, which sorts. One is for people, the other for
        fingerprinting.
        """
        rendered = serialise.to_yaml(
            schemas.LogbookEntry(
                performed_on=date(2026, 3, 12),
                setting="Bristol Royal Infirmary",
                outcome="Successful",
            )
        )

        lines = [line.split(":")[0] for line in rendered.splitlines()]

        assert lines.index("performed_on") < lines.index("setting")
        assert lines.index("setting") < lines.index("outcome")

    def test_lists_are_indented_under_their_key(self) -> None:
        rendered = serialise.to_yaml(
            schemas.Certificate(
                id="c-1",
                title="A course",
                issuer="A college",
                awarded_on=date(2025, 11, 4),
                competencies=[
                    schemas.CompetencyRef(
                        id="perform_bronchoscopy", name="Perform bronchoscopy"
                    )
                ],
            )
        )

        assert "competencies:\n  - id: perform_bronchoscopy" in rendered

    def test_multi_line_text_becomes_a_readable_block(self) -> None:
        """Otherwise a clinical note becomes one line of escapes."""
        rendered = serialise.to_yaml(
            schemas.LogbookEntry(
                performed_on=date(2026, 3, 12),
                notes="First paragraph.\n\nSecond paragraph.",
            )
        )

        assert "notes: |" in rendered
        assert "\\n" not in rendered

    def test_unset_optionals_are_left_out(self) -> None:
        """A file should carry what it says, not a column of nulls."""
        rendered = serialise.to_yaml(
            schemas.LogbookEntry(performed_on=date(2026, 3, 12))
        )

        assert "null" not in rendered
        assert "supervisor" not in rendered

    def test_dates_are_plain_strings(self) -> None:
        """A passport must not need Python to be read."""
        rendered = serialise.to_yaml(
            schemas.LogbookEntry(performed_on=date(2026, 3, 12))
        )

        assert "2026-03-12" in rendered

    def test_accented_text_is_not_escaped(self) -> None:
        rendered = serialise.to_yaml(
            schemas.Certificate(
                id="c-1",
                title="Bronchoscopy \u2014 r\u00f4le 2",
                issuer="A college",
                awarded_on=date(2025, 11, 4),
            )
        )

        assert "r\u00f4le" in rendered


class TestRoundTrip:
    def test_a_record_survives_being_written_and_read(self) -> None:
        entry = schemas.LogbookEntry(
            performed_on=date(2026, 3, 12),
            setting="Bristol Royal Infirmary",
            supervision="supervised",
            supervisor="Dr Amara Okonkwo",
            notes="Straightforward.",
        )

        assert (
            serialise.from_yaml(schemas.LogbookEntry, serialise.to_yaml(entry))
            == entry
        )

    def test_a_comment_does_not_disturb_reading(self) -> None:
        entry = schemas.LogbookEntry(performed_on=date(2026, 3, 12))

        rendered = serialise.to_yaml(entry, comment="One procedure.")

        assert serialise.from_yaml(schemas.LogbookEntry, rendered) == entry

    def test_bytes_read_as_well_as_text(self) -> None:
        """The store hands back bytes."""
        entry = schemas.LogbookEntry(performed_on=date(2026, 3, 12))

        rendered = serialise.to_yaml(entry).encode()

        assert serialise.from_yaml(schemas.LogbookEntry, rendered) == entry


class TestRefusals:
    def test_refuses_text_that_is_not_yaml(self) -> None:
        with pytest.raises(RecordFormatError, match="Not valid YAML"):
            serialise.from_yaml(schemas.LogbookEntry, "{[unclosed")

    def test_refuses_yaml_that_is_not_a_mapping(self) -> None:
        with pytest.raises(RecordFormatError, match="mapping"):
            serialise.from_yaml(schemas.LogbookEntry, "- a\n- list\n")

    def test_refuses_a_file_that_does_not_fit_the_model(self) -> None:
        """A hand-edited file that no longer fits is refused rather than
        half-parsed."""
        with pytest.raises(RecordFormatError, match="LogbookEntry"):
            serialise.from_yaml(schemas.LogbookEntry, "unexpected: true\n")

    def test_refuses_an_unknown_field(self) -> None:
        with pytest.raises(RecordFormatError):
            serialise.from_yaml(
                schemas.LogbookEntry,
                "performed_on: '2026-03-12'\ninvented_field: 1\n",
            )


class TestReflections:
    def test_frontmatter_then_prose(self) -> None:
        reflection = schemas.Reflection(
            title="A difficult airway", written_on=date(2026, 3, 14)
        )

        rendered = serialise.reflection_to_markdown(reflection, "The writing.")

        assert rendered.startswith("---\n")
        assert rendered.rstrip().endswith("The writing.")

    def test_a_reflection_round_trips(self) -> None:
        reflection = schemas.Reflection(
            title="A difficult airway",
            written_on=date(2026, 3, 14),
            competencies=[
                schemas.CompetencyRef(
                    id="perform_advanced_airway", name="Advanced airway"
                )
            ],
        )
        body = "It went badly, then better.\n"

        fields, prose = serialise.reflection_from_markdown(
            serialise.reflection_to_markdown(reflection, body)
        )

        assert fields == reflection
        assert prose == body

    def test_a_horizontal_rule_in_the_prose_survives(self) -> None:
        """Splitting on every '---' would truncate somebody's writing at
        the first one they used as a rule."""
        body = "Before.\n\n---\n\nAfter.\n"

        _, prose = serialise.reflection_from_markdown(
            serialise.reflection_to_markdown(
                schemas.Reflection(
                    title="A reflection", written_on=date(2026, 3, 14)
                ),
                body,
            )
        )

        assert prose == body

    def test_refuses_a_file_with_no_frontmatter(self) -> None:
        """Without it there is no date and no title, so it cannot be
        placed in a passport even though the prose is intact."""
        with pytest.raises(RecordFormatError, match="frontmatter"):
            serialise.reflection_from_markdown("Just some writing.\n")

    def test_refuses_an_unclosed_frontmatter_block(self) -> None:
        with pytest.raises(RecordFormatError, match="not closed"):
            serialise.reflection_from_markdown(
                "---\ntitle: A thing\nwritten_on: '2026-03-14'\n"
            )

    def test_a_body_is_given_a_trailing_newline(self) -> None:
        rendered = serialise.reflection_to_markdown(
            schemas.Reflection(title="A thing", written_on=date(2026, 3, 14)),
            "No newline at the end",
        )

        assert rendered.endswith("\n")
