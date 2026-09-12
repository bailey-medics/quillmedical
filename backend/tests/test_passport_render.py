"""Tests for app/features/passport/render.py.

Rendering is a view over real files, so these build a real passport
through the service and records layers and render what comes out. A
fixture of hand-written Markdown would test the fixture.

Three properties carry the weight, and each is a decision rather than a
formatting detail:

**Reflections are excluded unless asked for.** A rendering handed to a
panel or an employer must not carry one by accident. Written reflection
can be disclosed in legal proceedings, so the default has to be the
narrow one and the test asserts the default rather than the option.

**Nothing judges sufficiency.** The logbook count appears; no target, no
percentage, no ready-or-not. A word-list test fails if any of those
appear in the output.

**Superseded records stay visible.** A document showing only current
conclusions would hide what was decided and when, which is the opposite
of what an audit trail is for.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from app.features.passport import records, render, service
from app.features.passport.commits import Actor
from app.features.passport.schemas import (
    Certificate,
    CompetencyRef,
    CpdEntry,
    LogbookEntry,
    Reflection,
)
from app.features.passport.store import LocalPassportStore

PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"
COMPETENCY = "prescribe_sact"
LEVEL = "review_and_authorise"

#: Words that would mean the document had formed a view on whether
#: somebody has done enough. It counts and never compares.
JUDGEMENT_WORDS = (
    "target",
    "progress bar",
    "requirements met",
    "percent",
    "ready for",
    "sufficient",
)


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
    """A passport with nothing in it but its own identity."""
    created = LocalPassportStore(tmp_path)
    service.create_passport(
        created,
        PASSPORT_ID,
        holder,
        user_id="1",
        registrations=[{"body": "GMC", "number": "1234567"}],
    )
    return created


def _sign_off(
    store: LocalPassportStore, holder: Actor, assessor: Actor
) -> str:
    """Request and sign one competency, returning the folder name."""
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


class TestFrontPage:
    def test_it_names_the_holder(self, store: LocalPassportStore) -> None:
        output = render.render(store, PASSPORT_ID)

        assert "Dr Priya Kapoor" in output

    def test_registrations_are_shown_as_declared(
        self, store: LocalPassportStore
    ) -> None:
        """Quill checks no register, and the document says so."""
        output = render.render(store, PASSPORT_ID)

        assert "GMC 1234567" in output
        assert "declared, not verified" in output

    def test_an_empty_passport_still_renders(
        self, store: LocalPassportStore
    ) -> None:
        """Every section is present and says it holds nothing.

        A missing heading reads as an oversight; "Nothing recorded" is
        an answer.
        """
        output = render.render(store, PASSPORT_ID)

        for heading in (
            "## Competencies",
            "## Logbook",
            "## Certificates",
            "## Continuing professional development",
            "## Sign-offs in full",
        ):
            assert heading in output


class TestCompetencyTable:
    def test_a_signed_competency_appears_with_its_assessor(
        self,
        store: LocalPassportStore,
        holder: Actor,
        assessor: Actor,
    ) -> None:
        _sign_off(store, holder, assessor)

        output = render.render(store, PASSPORT_ID)

        assert "Review and authorise administration" in output
        assert "signed off" in output

    def test_a_requested_competency_reads_as_awaiting(
        self, store: LocalPassportStore, holder: Actor
    ) -> None:
        service.request_sign_off(
            store,
            PASSPORT_ID,
            holder,
            competency_id=COMPETENCY,
            observed_on=date(2026, 3, 14),
            level_id=LEVEL,
        )

        output = render.render(store, PASSPORT_ID)

        assert "awaiting assessor" in output


class TestLogbook:
    def test_entries_are_counted_and_listed(
        self, store: LocalPassportStore, holder: Actor
    ) -> None:
        for day in (12, 14, 16):
            records.add_logbook_entry(
                store,
                PASSPORT_ID,
                holder,
                COMPETENCY,
                LogbookEntry(
                    performed_on=date(2026, 3, day),
                    setting="Bristol Royal Infirmary",
                    outcome="Successful",
                ),
            )

        output = render.render(store, PASSPORT_ID)

        assert "3 recorded." in output

    def test_entries_sort_by_the_clinical_date(
        self, store: LocalPassportStore, holder: Actor
    ) -> None:
        """Not by filename, which is when Quill wrote the file.

        Logging three procedures in one sitting, newest first, would
        otherwise render in the order they were typed up.
        """
        for day in (20, 2, 11):
            records.add_logbook_entry(
                store,
                PASSPORT_ID,
                holder,
                COMPETENCY,
                LogbookEntry(performed_on=date(2026, 3, day)),
            )

        output = render.render(store, PASSPORT_ID)
        positions = [output.index(f"2026-03-{day:02d}") for day in (2, 11, 20)]

        assert positions == sorted(positions)

    def test_nothing_judges_sufficiency(
        self, store: LocalPassportStore, holder: Actor
    ) -> None:
        """Thirty-eight procedures is a count, not a verdict."""
        records.add_logbook_entry(
            store,
            PASSPORT_ID,
            holder,
            COMPETENCY,
            LogbookEntry(performed_on=date(2026, 3, 12)),
        )

        output = render.render(store, PASSPORT_ID).lower()

        found = [word for word in JUDGEMENT_WORDS if word in output]
        assert not found, (
            f"{found} would have the document judge whether the holder "
            "has done enough, which belongs to the assessor."
        )


class TestCertificatesAndCpd:
    def test_a_certificate_is_shown_as_self_declared(
        self, store: LocalPassportStore, holder: Actor
    ) -> None:
        """The difference from a sign-off has to be visible."""
        records.add_certificate(
            store,
            PASSPORT_ID,
            holder,
            Certificate(
                id=service.next_id(),
                title="SACT administration course",
                issuer="UKONS",
                awarded_on=date(2026, 2, 11),
                competencies=[
                    CompetencyRef(id=COMPETENCY, name="Prescribe SACT")
                ],
            ),
        )

        output = render.render(store, PASSPORT_ID)

        assert "SACT administration course" in output
        assert "nobody" in output.lower()

    def test_cpd_hours_are_totalled_per_year(
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

        output = render.render(store, PASSPORT_ID)

        assert "9 hours" in output


class TestReflectionsAreExcludedByDefault:
    def test_they_do_not_appear_unless_asked_for(
        self, store: LocalPassportStore, holder: Actor
    ) -> None:
        """The default must be the narrow one.

        A rendering handed to a panel or an employer must not carry a
        reflection by accident: written reflection can be disclosed in
        legal proceedings.
        """
        records.add_reflection(
            store,
            PASSPORT_ID,
            holder,
            Reflection(
                title="A difficult airway", written_on=date(2026, 3, 14)
            ),
            "Something private about a hard day.",
        )

        output = render.render(store, PASSPORT_ID)

        assert "## Reflections" not in output
        assert "Something private" not in output

    def test_they_appear_when_asked_for(
        self, store: LocalPassportStore, holder: Actor
    ) -> None:
        records.add_reflection(
            store,
            PASSPORT_ID,
            holder,
            Reflection(
                title="A difficult airway", written_on=date(2026, 3, 14)
            ),
            "Something private about a hard day.",
        )

        output = render.render(store, PASSPORT_ID, include_reflections=True)

        assert "## Reflections" in output
        assert "Something private" in output


class TestSignOffAppendix:
    def test_a_sign_off_carries_its_fingerprint(
        self,
        store: LocalPassportStore,
        holder: Actor,
        assessor: Actor,
    ) -> None:
        """So a printed page can be checked against the repository."""
        _sign_off(store, holder, assessor)

        output = render.render(store, PASSPORT_ID)

        assert "Fingerprint: `sha256:" in output

    def test_it_names_the_assessor_and_their_standing(
        self,
        store: LocalPassportStore,
        holder: Actor,
        assessor: Actor,
    ) -> None:
        """A reader judges whether the sign-off was appropriate.

        The system records rather than polices, so the document must
        carry who signed, their role and their registration.
        """
        _sign_off(store, holder, assessor)

        output = render.render(store, PASSPORT_ID)

        assert "Dr Amara Okonkwo" in output
        assert "GMC 7654321" in output
        assert "registration declared, not verified" in output

    def test_it_records_what_kind_of_act_the_sign_off_was(
        self,
        store: LocalPassportStore,
        holder: Actor,
        assessor: Actor,
    ) -> None:
        """Observed, reviewed and countersigned are different things."""
        _sign_off(store, holder, assessor)

        output = render.render(store, PASSPORT_ID)

        assert "directly observed" in output

    def test_a_superseded_record_stays_visible(
        self,
        store: LocalPassportStore,
        holder: Actor,
        assessor: Actor,
    ) -> None:
        """Hiding it would make the document a summary, not a record."""
        name = _sign_off(store, holder, assessor)
        service.supersede_sign_off(store, PASSPORT_ID, assessor, name=name)

        output = render.render(store, PASSPORT_ID)

        assert "superseded" in output.lower()


class TestTheDocumentIsNotStored:
    def test_rendering_writes_nothing(
        self,
        store: LocalPassportStore,
        holder: Actor,
        assessor: Actor,
    ) -> None:
        """A stored rendering would be a second version of the truth.

        Asserted through the head commit: rendering must not produce one.
        """
        _sign_off(store, holder, assessor)
        before = store.head(PASSPORT_ID).commit

        render.render(store, PASSPORT_ID)

        assert store.head(PASSPORT_ID).commit == before
