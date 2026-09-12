"""What an export writes to the log, and what a rendering looks like.

Two things the plan asks for that the other Phase 4 tests do not cover.

**Exports are logged, and the log carries no content.** The plan's audit
rule is that the git history is the audit trail and exports are recorded
in the application log — who, which passport, when, and nothing else. A
passport holds no patient data, but it is somebody's assessment record
and an application log is read by people with no business in it. So the
test is not merely that a line appears: it is that the line does *not*
contain the holder's name, a competency, an assessor, or any of the
prose.

**A rendered passport is pinned as a snapshot.** Rendering is the part
most likely to drift without anybody noticing — a heading reworded, a
section reordered, a date format changed — because every individual
change looks harmless and no other test would fail. Comparing a whole
document against a fixture makes drift visible in the diff, which is
where it can be judged.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, date, datetime
from pathlib import Path

import pytest

from app.features.passport import export, records, render, service
from app.features.passport.commits import Actor
from app.features.passport.schemas import Certificate, CpdEntry, LogbookEntry
from app.features.passport.store import LocalPassportStore

PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"
COMPETENCY = "prescribe_sact"
LEVEL = "review_and_authorise"

#: Everything a log line must not carry. Names and prose from the
#: fixtures below, plus the words a competency or an assessment would
#: appear under.
CONTENT_MARKERS = (
    "Priya",
    "Kapoor",
    "Amara",
    "Okonkwo",
    "prescribe_sact",
    "SACT course",
    "UKONS",
    "Bristol",
    "GMC",
    "1234567",
    "7654321",
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
def populated(
    tmp_path: Path, holder: Actor, assessor: Actor
) -> LocalPassportStore:
    """A passport with a signed competency, a procedure and a course.

    Fixed dates throughout, because the snapshot below compares a whole
    document and anything derived from "now" would make it fail
    tomorrow.
    """
    store = LocalPassportStore(tmp_path)
    service.create_passport(
        store,
        PASSPORT_ID,
        holder,
        user_id="1",
        registrations=[{"body": "GMC", "number": "1234567"}],
        now=datetime(2026, 1, 5, 9, 0, tzinfo=UTC),
    )

    name, _ = service.request_sign_off(
        store,
        PASSPORT_ID,
        holder,
        competency_id=COMPETENCY,
        observed_on=date(2026, 3, 14),
        level_id=LEVEL,
        now=datetime(2026, 3, 15, 9, 0, tzinfo=UTC),
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
        now=datetime(2026, 3, 20, 9, 0, tzinfo=UTC),
    )

    records.add_logbook_entry(
        store,
        PASSPORT_ID,
        holder,
        COMPETENCY,
        LogbookEntry(
            performed_on=date(2026, 3, 12),
            setting="Bristol Royal Infirmary",
            supervision="supervised",
            outcome="Successful",
        ),
        now=datetime(2026, 3, 13, 9, 0, tzinfo=UTC),
    )
    records.add_certificate(
        store,
        PASSPORT_ID,
        holder,
        Certificate(
            id="20260211T090000.000Z-" + "a" * 32,
            title="SACT course",
            issuer="UKONS",
            awarded_on=date(2026, 2, 11),
        ),
        now=datetime(2026, 2, 12, 9, 0, tzinfo=UTC),
    )
    records.add_cpd_entry(
        store,
        PASSPORT_ID,
        holder,
        CpdEntry(
            activity_on=date(2026, 2, 11),
            title="Regional study day",
            activity_type="teaching day",
            hours=6,
        ),
        now=datetime(2026, 2, 12, 10, 0, tzinfo=UTC),
    )

    return store


class TestExportsAreLogged:
    def test_a_line_records_who_what_and_when(
        self, populated: LocalPassportStore, caplog: pytest.LogCaptureFixture
    ) -> None:
        """The plan's audit rule: exports are recorded, content is not."""
        with caplog.at_level(logging.INFO, logger="app.features.passport"):
            export.build_bundle(populated, PASSPORT_ID, requested_by="1")

        lines = [
            record.getMessage()
            for record in caplog.records
            if "Passport export" in record.getMessage()
        ]

        assert len(lines) == 1
        assert PASSPORT_ID in lines[0]
        assert "requested_by=1" in lines[0]

    def test_the_log_carries_no_content(
        self, populated: LocalPassportStore, caplog: pytest.LogCaptureFixture
    ) -> None:
        """An application log is read by people with no business in it.

        A passport holds no patient data, but it is somebody's
        assessment record: their name, what they were signed off for and
        by whom are all things a log has no reason to carry.
        """
        with caplog.at_level(logging.INFO, logger="app.features.passport"):
            export.build_bundle(populated, PASSPORT_ID, requested_by="1")

        logged = " ".join(record.getMessage() for record in caplog.records)

        found = [marker for marker in CONTENT_MARKERS if marker in logged]
        assert not found, (
            f"{found} reached the application log, which records who "
            "exported what and when — never what the record says."
        )

    def test_an_unattributed_export_says_so(
        self, populated: LocalPassportStore, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Rather than inventing an actor or omitting the field."""
        with caplog.at_level(logging.INFO, logger="app.features.passport"):
            export.build_bundle(populated, PASSPORT_ID)

        lines = [
            record.getMessage()
            for record in caplog.records
            if "Passport export" in record.getMessage()
        ]

        assert "requested_by=unattributed" in lines[0]


class TestTheRenderedMarkdownIsPinned:
    """Rendering drifts quietly; a whole-document comparison shows it."""

    def test_it_matches_the_expected_shape(
        self, populated: LocalPassportStore
    ) -> None:
        """Compared with the generation date normalised.

        The date is the one part that legitimately changes on every run,
        so it is replaced rather than frozen — freezing it would mean
        threading a clock through the renderer for no other reason.
        """
        output = render.render(populated, PASSPORT_ID)
        normalised = re.sub(
            r"Generated \d{4}-\d{2}-\d{2}\.", "Generated <date>.", output
        )
        # The fingerprint covers the sign-off's id, which carries a
        # uuid4: the same sign-off made twice with identical inputs is
        # deliberately a different record with a different hash. So it
        # cannot be pinned here, and a separate test asserts a real one
        # is present.
        normalised = re.sub(
            r"sha256:[0-9a-f]{64}", "sha256:<hash>", normalised
        )

        assert normalised == EXPECTED_MARKDOWN

    def test_every_section_is_present_in_order(
        self, populated: LocalPassportStore
    ) -> None:
        """Reordering would be a real change and should be deliberate."""
        output = render.render(populated, PASSPORT_ID)
        headings = re.findall(r"^## (.+)$", output, re.M)

        assert headings == [
            "Competencies",
            "Logbook",
            "Certificates",
            "Continuing professional development",
            "Sign-offs in full",
        ]

    def test_the_fingerprint_survives_rendering(
        self, populated: LocalPassportStore
    ) -> None:
        """The snapshot normalises nothing else, so this is a real hash."""
        output = render.render(populated, PASSPORT_ID)

        assert re.search(r"Fingerprint: `sha256:[0-9a-f]{64}`", output)


#: One whole rendered passport, for the fixture above. Long by design:
#: the point is that a change anywhere in the document shows up in the
#: diff of this constant, where somebody can look at it and decide
#: whether it was intended.
EXPECTED_MARKDOWN = """\
# Clinician passport

**Dr Priya Kapoor**

- GMC 1234567 — _declared, not verified_

Generated <date>.

This is a record of assessed clinical competence: what this person has been signed off to do, by whom, and on what evidence. Registrations are recorded as declared; a registration is marked verified only where somebody has checked a register by hand.

## Competencies

| Competency | Level | Status | Signed off by | Date | Expires |
| --- | --- | --- | --- | --- | --- |
| Review and prescribe systemic anti-cancer therapy | Review and authorise administration | signed off | Dr Amara Okonkwo | 2026-03-20 | — |

## Logbook

### Review and prescribe systemic anti-cancer therapy

1 recorded.

- **2026-03-12** — Bristol Royal Infirmary, supervised, Successful

## Certificates

Self-declared: recorded by the holder, with nobody countersigning.

- **SACT course** — UKONS, 2026-02-11

## Continuing professional development

### 2026

1 activity, 6 hours.

- **2026-02-11** — Regional study day [teaching day] (6 hours)

## Sign-offs in full

### Review and prescribe systemic anti-cancer therapy

**Level:** Review and authorise administration

- Status: signed_off
- Kind: initial
- Observed: 2026-03-14
- Signed: 2026-03-20
- The assessor directly observed
- Signed off by: Dr Amara Okonkwo, consultant (GMC 7654321) — _registration declared, not verified_
- Evidence in view when signed: 0 logbook entries, 0 certificates

Fingerprint: `sha256:<hash>`
Record: `2026-03-14-review-and-prescribe-systemic-anti-cancer-therapy`
"""
