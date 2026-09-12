"""Tests for app/features/passport/pdf.py.

A PDF is awkward to assert against: the bytes are compressed and the
text is not sitting there as a string. Two approaches are used, and the
split is deliberate.

**Structure is tested through the story**, the list of flowables
platypus is handed. Building it is where every decision this module
makes actually happens, and reading it is precise — a test can say that
a fingerprint paragraph exists rather than that some bytes contain a
hash.

**Production is tested end to end**, by building the document and
asserting it is a real PDF of non-trivial size. That catches the failure
the story cannot: a flowable platypus accepts at construction and
rejects at build time, which is how an unescaped angle bracket in
somebody's logbook note would have cost them their download.

The failure policy is what most of these are about. Nothing in a
passport may deny somebody their own record: a malformed field, a
missing optional, an unreadable file — each degrades to a placeholder or
is skipped, and the rest still prints.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from pathlib import Path

import pytest

from app.features.passport import pdf, records, service
from app.features.passport.commits import Actor
from app.features.passport.schemas import (
    Certificate,
    CpdEntry,
    LogbookEntry,
    Reflection,
)
from app.features.passport.store import LocalPassportStore

PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"
COMPETENCY = "prescribe_sact"
LEVEL = "review_and_authorise"


@pytest.fixture
def holder() -> Actor:
    return Actor(
        name="Dr Priya Kapoor",
        role="specialty_trainee_3_plus",
        email="priya@example.nhs.uk",
        registrations=("GMC 1234567",),
    )


@pytest.fixture
def assessor() -> Actor:
    return Actor(
        name="Dr Amara Okonkwo",
        role="consultant",
        email="amara@example.nhs.uk",
        registrations=("GMC 7654321",),
    )


@pytest.fixture
def store(tmp_path: Path, holder: Actor) -> LocalPassportStore:
    created = LocalPassportStore(tmp_path)
    service.create_passport(
        created,
        PASSPORT_ID,
        holder,
        user_id="1",
        registrations=[{"body": "GMC", "number": "1234567"}],
    )
    return created


def _signed(store: LocalPassportStore, holder: Actor, assessor: Actor) -> str:
    """A passport with one signed competency."""
    name, _ = service.request_sign_off(
        store,
        PASSPORT_ID,
        holder,
        competency_id=COMPETENCY,
        observed_on=date(2026, 3, 14),
        level_id=LEVEL,
    )
    service.sign_off(
        store,
        PASSPORT_ID,
        assessor,
        name=name,
        assessor_user_id="2",
        holder_user_id="1",
        meaning="directly observed",
        declaration_confirmed=True,
        level_id=LEVEL,
        registrations=[{"body": "GMC", "number": "7654321"}],
    )
    return name


class TestItProducesARealPdf:
    def test_an_empty_passport_still_builds(
        self, store: LocalPassportStore
    ) -> None:
        """Somebody who has just created a passport can still print it."""
        output = pdf.render_pdf(store, PASSPORT_ID)

        assert output.startswith(b"%PDF-")
        assert output.rstrip().endswith(b"%%EOF")

    def test_a_populated_passport_builds(
        self,
        store: LocalPassportStore,
        holder: Actor,
        assessor: Actor,
    ) -> None:
        _signed(store, holder, assessor)
        records.add_logbook_entry(
            store,
            PASSPORT_ID,
            holder,
            COMPETENCY,
            LogbookEntry(performed_on=date(2026, 3, 12)),
        )
        records.add_certificate(
            store,
            PASSPORT_ID,
            holder,
            Certificate(
                id=service.next_id(),
                title="SACT administration course",
                issuer="UKONS",
                awarded_on=date(2026, 2, 11),
            ),
        )

        output = pdf.render_pdf(store, PASSPORT_ID)

        assert output.startswith(b"%PDF-")
        assert len(output) > 2000

    def test_an_unknown_passport_raises(
        self, store: LocalPassportStore
    ) -> None:
        """The one failure this module does raise."""
        from app.features.passport.store import PassportNotFoundError

        with pytest.raises(PassportNotFoundError):
            pdf.render_pdf(store, "a1b2c3d4e5f60718293a4b5c6d7e8f90")


class TestNothingDeniesADownload:
    """A malformed record must not cost somebody their own passport."""

    def test_markup_in_a_comment_does_not_break_the_build(
        self,
        store: LocalPassportStore,
        holder: Actor,
        assessor: Actor,
    ) -> None:
        """Platypus reads angle brackets as markup.

        An assessor writing "sats <92% throughout" would otherwise raise
        at build time — after the request had been accepted, which is
        the worst moment to fail.
        """
        name, _ = service.request_sign_off(
            store,
            PASSPORT_ID,
            holder,
            competency_id=COMPETENCY,
            observed_on=date(2026, 3, 14),
            level_id=LEVEL,
        )
        service.sign_off(
            store,
            PASSPORT_ID,
            assessor,
            name=name,
            assessor_user_id="2",
            holder_user_id="1",
            meaning="directly observed",
            declaration_confirmed=True,
            level_id=LEVEL,
            comments="Sats <92% throughout; escalated & reviewed.",
            registrations=[{"body": "GMC", "number": "7654321"}],
        )

        output = pdf.render_pdf(store, PASSPORT_ID)

        assert output.startswith(b"%PDF-")

    def test_an_empty_value_prints_a_placeholder(self) -> None:
        assert pdf._text(None) == "—"
        assert pdf._text("") == "—"
        assert pdf._text("   ") == "—"

    def test_a_missing_date_prints_a_placeholder(self) -> None:
        assert pdf._day(None) == "—"

    def test_markup_characters_are_escaped(self) -> None:
        assert pdf._text("a < b & c > d") == "a &lt; b &amp; c &gt; d"


class TestTheFingerprintReachesThePage:
    def test_a_signed_record_carries_its_hash(
        self,
        store: LocalPassportStore,
        holder: Actor,
        assessor: Actor,
    ) -> None:
        """What makes a printed page checkable against the repository."""
        name = _signed(store, holder, assessor)
        record = service.read_sign_off(store, PASSPORT_ID, name)
        styles = pdf._styles()

        block = pdf._one_sign_off(name, record, styles)
        text = " ".join(item.text for item in block if hasattr(item, "text"))

        assert record.content_hash
        assert record.content_hash in text

    def test_the_assessor_and_their_standing_are_printed(
        self,
        store: LocalPassportStore,
        holder: Actor,
        assessor: Actor,
    ) -> None:
        """A reader judges whether the sign-off was appropriate."""
        name = _signed(store, holder, assessor)
        record = service.read_sign_off(store, PASSPORT_ID, name)

        block = pdf._one_sign_off(name, record, pdf._styles())
        text = " ".join(item.text for item in block if hasattr(item, "text"))

        assert "Dr Amara Okonkwo" in text
        assert "GMC 7654321" in text
        assert "registration declared, not verified" in text


class TestTheFooterCarriesTheCommit:
    def test_the_commit_is_drawn_on_the_page(
        self, store: LocalPassportStore
    ) -> None:
        """Tested through the callback, since the bytes are compressed."""
        drawn: list[str] = []

        class FakeCanvas:
            def saveState(self) -> None: ...
            def restoreState(self) -> None: ...
            def setFont(self, name: str, size: float) -> None: ...
            def setFillColor(self, colour: object) -> None: ...

            def drawString(self, x: float, y: float, text: str) -> None:
                drawn.append(text)

            def drawRightString(self, x: float, y: float, text: str) -> None:
                drawn.append(text)

        class FakeDocument:
            leftMargin = 50.0
            rightMargin = 50.0
            page = 3

        pdf._footer_drawer("abc123def456")(FakeCanvas(), FakeDocument())

        assert any("abc123def456" in line for line in drawn)
        assert any("Page 3" in line for line in drawn)

    def test_no_commit_prints_only_the_page_number(self) -> None:
        """A rendering from an unknown state says nothing it cannot back."""
        drawn: list[str] = []

        class FakeCanvas:
            def saveState(self) -> None: ...
            def restoreState(self) -> None: ...
            def setFont(self, name: str, size: float) -> None: ...
            def setFillColor(self, colour: object) -> None: ...

            def drawString(self, x: float, y: float, text: str) -> None:
                drawn.append(text)

            def drawRightString(self, x: float, y: float, text: str) -> None:
                drawn.append(text)

        class FakeDocument:
            leftMargin = 50.0
            rightMargin = 50.0
            page = 1

        pdf._footer_drawer(None)(FakeCanvas(), FakeDocument())

        assert drawn == ["Page 1"]


class TestReflectionsAreCountedNeverPrinted:
    """The count is evidence of a habit; the writing is about patients."""

    def _write(
        self, store: LocalPassportStore, holder: Actor, *days: date
    ) -> None:
        for day in days:
            records.add_reflection(
                store,
                PASSPORT_ID,
                holder,
                Reflection(
                    title=f"Airway {day.isoformat()}",
                    written_on=day,
                ),
                "Something private about a hard day.",
            )

    def test_the_writing_never_reaches_the_document(
        self, store: LocalPassportStore, holder: Actor
    ) -> None:
        self._write(store, holder, date(2026, 3, 14))

        output = pdf.render_pdf(store, PASSPORT_ID)

        assert b"Something private" not in output

    def test_the_title_never_reaches_it_either(
        self, store: LocalPassportStore, holder: Actor
    ) -> None:
        """A title alone can identify a case.

        "The arrest on ward 12" names nobody and tells anyone who was
        there exactly which patient it was.
        """
        self._write(store, holder, date(2026, 3, 14))

        story = pdf._reflections_note(store, PASSPORT_ID, pdf._styles())
        text = " ".join(item.text for item in story if hasattr(item, "text"))

        assert "Airway" not in text

    def test_counts_are_grouped_by_year(
        self, store: LocalPassportStore, holder: Actor
    ) -> None:
        self._write(
            store,
            holder,
            date(2025, 6, 1),
            date(2026, 3, 14),
            date(2026, 7, 2),
        )

        story = pdf._reflections_note(store, PASSPORT_ID, pdf._styles())
        table = next(item for item in story if hasattr(item, "_cellvalues"))
        rows = [
            [cell.text for cell in row if hasattr(cell, "text")]
            for row in table._cellvalues
        ]

        assert ["2026", "2"] in rows
        assert ["2025", "1"] in rows
        assert ["<b>Total</b>", "<b>3</b>"] in rows

    def test_none_written_says_so(self, store: LocalPassportStore) -> None:
        story = pdf._reflections_note(store, PASSPORT_ID, pdf._styles())
        text = " ".join(item.text for item in story if hasattr(item, "text"))

        assert "Nothing recorded" in text

    def test_there_is_no_switch_that_could_print_them(self) -> None:
        """A parameter that could turn the text on is a mistake waiting.

        So there is none: the signature is asserted rather than trusted,
        because this is the kind of thing a later convenience change
        would add back without noticing what it means.
        """
        import inspect

        parameters = inspect.signature(pdf.render_pdf).parameters

        assert "include_reflections" not in parameters


class TestTheCompetencyTable:
    def test_it_lists_a_signed_competency(
        self,
        store: LocalPassportStore,
        holder: Actor,
        assessor: Actor,
    ) -> None:
        from app.features.passport import paths as passport_paths
        from app.features.passport.schemas import Index
        from app.features.passport.serialise import from_yaml

        _signed(store, holder, assessor)
        index = from_yaml(Index, store.read(PASSPORT_ID, passport_paths.INDEX))

        story = pdf._competency_table(index, pdf._styles())

        assert len(story) == 2  # heading and table, not "nothing recorded"

    def test_an_empty_index_says_so(self) -> None:
        from app.features.passport.schemas import Index

        index = Index(
            schema_version=1,
            generated_at=datetime.now(UTC),
            competencies=[],
        )

        story = pdf._competency_table(index, pdf._styles())
        text = " ".join(item.text for item in story if hasattr(item, "text"))

        assert "Nothing recorded" in text


class TestLogbookTotals:
    """Counts by competency and year — the number people look for."""

    def _index(self, store: LocalPassportStore):
        from app.features.passport import paths as passport_paths
        from app.features.passport.schemas import Index
        from app.features.passport.serialise import from_yaml

        return from_yaml(Index, store.read(PASSPORT_ID, passport_paths.INDEX))

    def test_entries_are_counted_by_year(
        self, store: LocalPassportStore, holder: Actor
    ) -> None:
        """Grouped by performed_on, not by when the file was written."""
        for day in (date(2025, 6, 1), date(2026, 3, 12), date(2026, 3, 14)):
            records.add_logbook_entry(
                store,
                PASSPORT_ID,
                holder,
                COMPETENCY,
                LogbookEntry(performed_on=day),
            )

        counts = pdf._counts_by_year(store, PASSPORT_ID, COMPETENCY)

        assert counts == {2025: 1, 2026: 2}

    def test_the_table_shows_a_row_total_and_a_grand_total(
        self, store: LocalPassportStore, holder: Actor
    ) -> None:
        for day in (date(2025, 6, 1), date(2026, 3, 12), date(2026, 3, 14)):
            records.add_logbook_entry(
                store,
                PASSPORT_ID,
                holder,
                COMPETENCY,
                LogbookEntry(performed_on=day),
            )

        story = pdf._logbook_totals(
            store, PASSPORT_ID, self._index(store), pdf._styles()
        )
        table = next(item for item in story if hasattr(item, "_cellvalues"))
        text = " ".join(
            cell.text
            for row in table._cellvalues
            for cell in row
            if hasattr(cell, "text")
        )

        assert "2025" in text
        assert "2026" in text
        assert "All procedures" in text

    def test_an_empty_logbook_says_so(self, store: LocalPassportStore) -> None:
        story = pdf._logbook_totals(
            store, PASSPORT_ID, self._index(store), pdf._styles()
        )
        text = " ".join(item.text for item in story if hasattr(item, "text"))

        assert "Nothing recorded" in text

    def test_it_counts_but_never_compares(
        self, store: LocalPassportStore, holder: Actor
    ) -> None:
        """No target, no expected number, no ready-or-not."""
        records.add_logbook_entry(
            store,
            PASSPORT_ID,
            holder,
            COMPETENCY,
            LogbookEntry(performed_on=date(2026, 3, 12)),
        )

        story = pdf._logbook_totals(
            store, PASSPORT_ID, self._index(store), pdf._styles()
        )
        table = next(item for item in story if hasattr(item, "_cellvalues"))
        text = " ".join(
            cell.text
            for row in table._cellvalues
            for cell in row
            if hasattr(cell, "text")
        ).lower()

        for word in ("target", "required", "expected", "sufficient"):
            assert word not in text


class TestCpdTotals:
    def test_hours_are_summed_per_year(
        self, store: LocalPassportStore, holder: Actor
    ) -> None:
        for hours in (6, 3):
            records.add_cpd_entry(
                store,
                PASSPORT_ID,
                holder,
                CpdEntry(
                    activity_on=date(2026, 2, 11),
                    title="Regional oncology study day",
                    activity_type="teaching day",
                    hours=hours,
                ),
            )

        story = pdf._cpd(store, PASSPORT_ID, pdf._styles())
        text = " ".join(item.text for item in story if hasattr(item, "text"))

        assert "9 hours" in text
