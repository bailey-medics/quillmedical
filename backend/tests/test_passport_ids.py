"""Tests for app/features/passport/ids.py.

The interesting behaviour is all at the edges: a clock that stops, a
clock that goes backwards, and a millisecond that rolls into the next
second. A generator that only works while the clock behaves is a
generator that issues a duplicate identifier on the day a virtual
machine resumes.

Every test passes an explicit instant rather than reading the system
clock, so a failure means the logic is wrong rather than that the test
ran at an unlucky moment.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta, timezone

import pytest

from app.features.passport import ids


class TestTimestampIdGenerator:
    """Ids must never go backwards, whatever the clock does."""

    def test_an_id_matches_the_documented_format(self) -> None:
        generator = ids.TimestampIdGenerator()
        moment = datetime(2026, 3, 14, 14, 32, 7, 881000, tzinfo=UTC)

        value = generator.next(moment)

        assert value.startswith("20260314T143207.881Z-")
        assert ids.is_timestamp_id(value)

    def test_successive_ids_increase(self) -> None:
        generator = ids.TimestampIdGenerator()
        start = datetime(2026, 3, 14, 14, 32, 7, tzinfo=UTC)

        issued = [
            generator.next(start + timedelta(milliseconds=n)) for n in range(5)
        ]

        assert issued == sorted(issued)
        assert len(set(issued)) == 5

    def test_a_stopped_clock_still_advances_the_id(self) -> None:
        """Two records in the same millisecond are still two records."""
        generator = ids.TimestampIdGenerator()
        frozen = datetime(2026, 3, 14, 14, 32, 7, 100000, tzinfo=UTC)

        first = generator.next(frozen)
        second = generator.next(frozen)

        assert second > first

    def test_a_backwards_clock_does_not_reissue_an_earlier_id(self) -> None:
        """NTP steps and resumed virtual machines move clocks back."""
        generator = ids.TimestampIdGenerator()
        later = datetime(2026, 3, 14, 14, 32, 7, tzinfo=UTC)
        earlier = later - timedelta(seconds=30)

        first = generator.next(later)
        second = generator.next(earlier)

        assert second > first

    def test_the_carry_into_the_next_second_works(self) -> None:
        """The bug this test exists for.

        Bumping a previous id that landed on .999 by a millisecond cannot
        be done by replacing the microsecond field — it overflows. Only
        date arithmetic carries into the next second.
        """
        generator = ids.TimestampIdGenerator()
        frozen = datetime(2026, 3, 14, 14, 32, 7, 999000, tzinfo=UTC)

        first = generator.next(frozen)
        second = generator.next(frozen)

        assert first.startswith("20260314T143207.999Z-")
        assert second.startswith("20260314T143208.000Z-")
        assert second > first

    def test_the_carry_rolls_over_a_minute(self) -> None:
        generator = ids.TimestampIdGenerator()
        frozen = datetime(2026, 3, 14, 14, 32, 59, 999000, tzinfo=UTC)

        generator.next(frozen)
        second = generator.next(frozen)

        assert second.startswith("20260314T143300.000Z-")

    def test_sub_millisecond_precision_cannot_produce_a_duplicate(
        self,
    ) -> None:
        """The format keeps milliseconds, so the comparison must too.

        Two instants 100 microseconds apart render identically. Comparing
        at full precision would call the second one "later" and emit the
        same timestamp twice.
        """
        generator = ids.TimestampIdGenerator()
        base = datetime(2026, 3, 14, 14, 32, 7, 500000, tzinfo=UTC)

        first = generator.next(base)
        second = generator.next(base + timedelta(microseconds=100))

        assert first.split("-")[0] != second.split("-")[0]

    def test_a_non_utc_instant_is_converted_not_refused(self) -> None:
        generator = ids.TimestampIdGenerator()
        eastern = timezone(timedelta(hours=-5))
        moment = datetime(2026, 3, 14, 9, 32, 7, tzinfo=eastern)

        value = generator.next(moment)

        assert value.startswith("20260314T143207.")

    def test_a_naive_instant_is_refused(self) -> None:
        """Guessing a timezone is how a record ends up an hour out."""
        generator = ids.TimestampIdGenerator()

        with pytest.raises(ValueError, match="naive"):
            generator.next(datetime(2026, 3, 14, 14, 32, 7))  # noqa: DTZ001

    def test_uniqueness_holds_across_many_ids_in_one_instant(self) -> None:
        generator = ids.TimestampIdGenerator()
        frozen = datetime(2026, 3, 14, 14, 32, 7, tzinfo=UTC)

        issued = [generator.next(frozen) for _ in range(200)]

        assert len(set(issued)) == 200
        assert issued == sorted(issued)


class TestIsTimestampId:
    """Shape only: it asserts nothing about the instant being plausible."""

    def test_accepts_a_generated_id(self) -> None:
        generator = ids.TimestampIdGenerator()
        assert ids.is_timestamp_id(generator.next())

    @pytest.mark.parametrize(
        "bad",
        [
            "20260314T143207.881Z",  # no uuid
            "20260314T143207Z-" + "a" * 32,  # no milliseconds
            "20260314T143207.881Z-" + "A" * 32,  # upper-case hex
            "20260314T143207.881Z-" + "a" * 31,  # short uuid
            "not-an-id",
            "",
        ],
    )
    def test_rejects_a_malformed_id(self, bad: str) -> None:
        assert not ids.is_timestamp_id(bad)

    def test_accepts_an_implausible_but_well_formed_date(self) -> None:
        """A validator that refused a surprising date would refuse to read
        a passport written by a machine with a bad clock — which is
        exactly when the record matters most."""
        assert ids.is_timestamp_id("19700101T000000.000Z-" + "0" * 32)


class TestPassportId:
    def test_is_32_lower_case_hex(self) -> None:
        value = ids.new_passport_id()

        assert len(value) == 32
        assert value == value.lower()
        assert "-" not in value

    def test_ids_differ(self) -> None:
        assert ids.new_passport_id() != ids.new_passport_id()


class TestEntryFilename:
    """The write time, because the server always knows it."""

    def test_has_no_colons(self) -> None:
        """Windows rejects them in filenames."""
        moment = datetime(2026, 3, 14, 14, 32, 7, tzinfo=UTC)

        assert ids.entry_filename(moment) == "2026-03-14-143207"

    def test_converts_to_utc_first(self) -> None:
        eastern = timezone(timedelta(hours=-5))
        moment = datetime(2026, 3, 14, 9, 32, 7, tzinfo=eastern)

        assert ids.entry_filename(moment) == "2026-03-14-143207"

    def test_refuses_a_naive_instant(self) -> None:
        with pytest.raises(ValueError, match="naive"):
            ids.entry_filename(
                datetime(2026, 3, 14, 14, 32, 7)
            )  # noqa: DTZ001


class TestSlugify:
    """Deliberately lossy: the authoritative value is inside the file."""

    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("Perform bronchoscopy", "perform-bronchoscopy"),
            (
                "Prescribe Schedule 2 Controlled Drugs",
                "prescribe-schedule-2-controlled-drugs",
            ),
            ("  leading and trailing  ", "leading-and-trailing"),
            ("Multiple   spaces", "multiple-spaces"),
            ("Punctuation!? removed.", "punctuation-removed"),
            ("Slashes/and\\backslashes", "slashes-and-backslashes"),
        ],
    )
    def test_reduces_to_words(self, text: str, expected: str) -> None:
        assert ids.slugify(text) == expected

    @pytest.mark.parametrize("text", ["", "!!!", "   ", "---"])
    def test_falls_back_rather_than_returning_empty(self, text: str) -> None:
        """An empty slug would end a folder name in a bare hyphen."""
        assert ids.slugify(text) == "untitled"

    def test_never_produces_a_path_separator(self) -> None:
        assert "/" not in ids.slugify("a/b/c")
        assert "\\" not in ids.slugify("a\\b\\c")

    def test_never_produces_a_leading_dot(self) -> None:
        """A name starting with a dot would be hidden, or be ``..``."""
        assert not ids.slugify("..").startswith(".")
        assert not ids.slugify(".git").startswith(".")


class TestRecordDirName:
    """The date the record is about, not when it was written."""

    def test_first_of_the_day_has_no_suffix(self) -> None:
        assert (
            ids.record_dir_name(date(2026, 3, 14), "Perform bronchoscopy")
            == "2026-03-14-perform-bronchoscopy"
        )

    def test_a_clash_is_numbered_from_two(self) -> None:
        assert (
            ids.record_dir_name(
                date(2026, 3, 14), "Perform bronchoscopy", suffix=2
            )
            == "2026-03-14-perform-bronchoscopy-2"
        )

    def test_a_later_clash_keeps_counting(self) -> None:
        assert ids.record_dir_name(
            date(2026, 3, 14), "Perform bronchoscopy", suffix=11
        ).endswith("-11")

    def test_refuses_a_suffix_below_one(self) -> None:
        with pytest.raises(ValueError, match="1 or greater"):
            ids.record_dir_name(date(2026, 3, 14), "A thing", suffix=0)

    def test_the_result_is_accepted_by_the_paths_module(self) -> None:
        """The two modules have to agree, or a generated name cannot be
        used to build the path it is for."""
        from app.features.passport import paths

        name = ids.record_dir_name(date(2026, 3, 14), "Perform bronchoscopy")

        assert paths.sign_off_dir(name).name == name

    def test_a_label_with_no_usable_words_still_yields_a_name(self) -> None:
        from app.features.passport import paths

        name = ids.record_dir_name(date(2026, 3, 14), "!!!")

        assert name == "2026-03-14-untitled"
        assert paths.sign_off_dir(name).name == name
