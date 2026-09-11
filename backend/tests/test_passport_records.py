"""Tests for app/features/passport/records.py and index.py.

Self-declared evidence and the index derived from it, against a real
store and real git repositories.

The properties worth pinning:

- **One write, one commit.** Records and the index they summarise land
  together, so no commit in history has a summary that disagrees with
  its own records.
- **The index counts and never compares.** A target or a percentage
  appearing here would be the software judging sufficiency.
- **These records are editable.** Unlike a sign-off, which is corrected
  only by superseding it.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from pathlib import Path

import pygit2
import pytest

from app.features.passport import (
    commits,
    index,
    paths,
    records,
    schemas,
    serialise,
    store,
)
from app.features.passport.records import RecordNotFoundError

PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"
NOW = datetime(2026, 3, 14, 14, 32, 7, tzinfo=UTC)


@pytest.fixture
def actor() -> commits.Actor:
    return commits.Actor(
        name="Dr Sam Reeve", role="Registrar", email="sam@example.nhs.uk"
    )


@pytest.fixture
def passport(tmp_path: Path, actor: commits.Actor) -> store.LocalPassportStore:
    created = store.LocalPassportStore(tmp_path)
    empty = index.render(
        schemas.Index(schema_version=1, generated_at=NOW, competencies=[])
    )
    created.create(
        PASSPORT_ID,
        store.initial_files("passport_id: x\n", "user_id: y\n", empty),
        commits.build("create", "new passport", actor),
        actor,
    )
    return created


def _read_index(passport: store.LocalPassportStore) -> schemas.Index:
    return serialise.from_yaml(
        schemas.Index, passport.read(PASSPORT_ID, paths.INDEX)
    )


def _entry(
    passport: store.LocalPassportStore, competency: str
) -> schemas.IndexEntry:
    for entry in _read_index(passport).competencies:
        if entry.id == competency:
            return entry
    raise AssertionError(f"{competency} not in the index")


def _certificate(**overrides: object) -> schemas.Certificate:
    fields: dict[str, object] = {
        "id": "20251104T090000.000Z-" + "a" * 32,
        "title": "Bronchoscopy course",
        "issuer": "Royal College of Physicians",
        "awarded_on": date(2025, 11, 4),
    }
    fields.update(overrides)
    return schemas.Certificate(**fields)  # type: ignore[arg-type]


class TestOneWriteOneCommit:
    def test_a_record_and_its_index_land_together(
        self,
        passport: store.LocalPassportStore,
        actor: commits.Actor,
        tmp_path: Path,
    ) -> None:
        """No commit may have a summary disagreeing with its records."""
        before = pygit2.Repository(str(tmp_path / paths.shard(PASSPORT_ID)))
        start = len(list(before.walk(before.head.target)))

        records.add_logbook_entry(
            passport,
            PASSPORT_ID,
            actor,
            "perform_cannulation",
            schemas.LogbookEntry(performed_on=date(2026, 3, 12)),
            now=NOW,
        )

        after = pygit2.Repository(str(tmp_path / paths.shard(PASSPORT_ID)))
        assert len(list(after.walk(after.head.target))) == start + 1

    def test_the_index_in_that_commit_already_counts_the_record(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        records.add_logbook_entry(
            passport,
            PASSPORT_ID,
            actor,
            "perform_cannulation",
            schemas.LogbookEntry(performed_on=date(2026, 3, 12)),
            now=NOW,
        )

        assert _entry(passport, "perform_cannulation").logbook_entries == 1


class TestLogbook:
    def test_an_entry_is_filed_under_its_competency(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        stem, _ = records.add_logbook_entry(
            passport,
            PASSPORT_ID,
            actor,
            "perform_bronchoscopy",
            schemas.LogbookEntry(performed_on=date(2026, 3, 12)),
            now=NOW,
        )

        stored = serialise.from_yaml(
            schemas.LogbookEntry,
            passport.read(
                PASSPORT_ID, paths.logbook_entry("perform_bronchoscopy", stem)
            ),
        )

        assert stored.performed_on == date(2026, 3, 12)

    def test_a_same_second_collision_bumps_to_the_next(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        """Rather than adding a hash suffix, which reads as noise."""
        first, _ = records.add_logbook_entry(
            passport,
            PASSPORT_ID,
            actor,
            "perform_bronchoscopy",
            schemas.LogbookEntry(performed_on=date(2026, 3, 12)),
            now=NOW,
        )
        second, _ = records.add_logbook_entry(
            passport,
            PASSPORT_ID,
            actor,
            "perform_bronchoscopy",
            schemas.LogbookEntry(performed_on=date(2026, 3, 13)),
            now=NOW,
        )

        assert first == "2026-03-14-143207"
        assert second == "2026-03-14-143208"

    def test_an_entry_can_count_towards_several_competencies(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        """An unusual case need not be duplicated on disk."""
        records.add_logbook_entry(
            passport,
            PASSPORT_ID,
            actor,
            "perform_bronchoscopy",
            schemas.LogbookEntry(
                performed_on=date(2026, 3, 12),
                also_counts_towards=["take_informed_consent"],
            ),
            now=NOW,
        )

        assert _entry(passport, "perform_bronchoscopy").logbook_entries == 1
        assert _entry(passport, "take_informed_consent").logbook_entries == 1

    def test_an_entry_is_editable(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        """A mistyped date should be fixable in seconds."""
        stem, _ = records.add_logbook_entry(
            passport,
            PASSPORT_ID,
            actor,
            "perform_bronchoscopy",
            schemas.LogbookEntry(performed_on=date(2026, 3, 12)),
            now=NOW,
        )

        records.amend_logbook_entry(
            passport,
            PASSPORT_ID,
            actor,
            "perform_bronchoscopy",
            stem,
            schemas.LogbookEntry(performed_on=date(2026, 3, 11)),
            now=NOW,
        )

        stored = serialise.from_yaml(
            schemas.LogbookEntry,
            passport.read(
                PASSPORT_ID, paths.logbook_entry("perform_bronchoscopy", stem)
            ),
        )
        assert stored.performed_on == date(2026, 3, 11)

    def test_an_entry_can_be_removed(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        stem, _ = records.add_logbook_entry(
            passport,
            PASSPORT_ID,
            actor,
            "perform_bronchoscopy",
            schemas.LogbookEntry(performed_on=date(2026, 3, 12)),
            now=NOW,
        )

        records.remove_logbook_entry(
            passport, PASSPORT_ID, actor, "perform_bronchoscopy", stem, now=NOW
        )

        assert _read_index(passport).competencies == []

    def test_amending_something_absent_is_refused(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        """Otherwise an empty commit would claim to have corrected one."""
        with pytest.raises(RecordNotFoundError):
            records.amend_logbook_entry(
                passport,
                PASSPORT_ID,
                actor,
                "perform_bronchoscopy",
                "2026-03-14-143207",
                schemas.LogbookEntry(performed_on=date(2026, 3, 12)),
                now=NOW,
            )


class TestCertificates:
    def test_a_certificate_is_filed_flat(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        """One course legitimately supports several competencies."""
        name, _ = records.add_certificate(
            passport, PASSPORT_ID, actor, _certificate(), now=NOW
        )

        assert name == "2025-11-04-bronchoscopy-course"

    def test_it_reaches_every_competency_it_relates_to(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        name, _ = records.add_certificate(
            passport,
            PASSPORT_ID,
            actor,
            _certificate(
                competencies=[
                    schemas.CompetencyRef(
                        id="perform_bronchoscopy", name="Perform bronchoscopy"
                    ),
                    schemas.CompetencyRef(
                        id="take_informed_consent",
                        name="Take informed consent",
                    ),
                ]
            ),
            now=NOW,
        )

        assert _entry(passport, "perform_bronchoscopy").certificates == [name]
        assert _entry(passport, "take_informed_consent").certificates == [name]

    def test_a_same_day_clash_is_suffixed(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        first, _ = records.add_certificate(
            passport, PASSPORT_ID, actor, _certificate(), now=NOW
        )
        second, _ = records.add_certificate(
            passport, PASSPORT_ID, actor, _certificate(), now=NOW
        )

        assert first == "2025-11-04-bronchoscopy-course"
        assert second == "2025-11-04-bronchoscopy-course-2"

    def test_amending_keeps_the_folder_name(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        """The name is the handle the index refers to; renaming would
        orphan every reference for the sake of cosmetics."""
        name, _ = records.add_certificate(
            passport, PASSPORT_ID, actor, _certificate(), now=NOW
        )

        records.amend_certificate(
            passport,
            PASSPORT_ID,
            actor,
            name,
            _certificate(title="Advanced bronchoscopy course"),
            now=NOW,
        )

        stored = serialise.from_yaml(
            schemas.Certificate,
            passport.read(PASSPORT_ID, paths.certificate_file(name)),
        )
        assert stored.title == "Advanced bronchoscopy course"


class TestReflections:
    def test_the_prose_is_kept_verbatim(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        """Reformatting somebody's reflection would change what they
        wrote, including any '---' they used as a rule."""
        body = "It went badly.\n\n---\n\nThen it went better.\n"

        name, _ = records.add_reflection(
            passport,
            PASSPORT_ID,
            actor,
            schemas.Reflection(
                title="A difficult airway", written_on=date(2026, 3, 14)
            ),
            body,
            now=NOW,
        )

        _, stored = serialise.reflection_from_markdown(
            passport.read(PASSPORT_ID, paths.reflection_file(name))
        )
        assert stored == body

    def test_a_reflection_does_not_reach_the_index(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        """Holder-only, so it must not surface in the summary anyone
        else may read."""
        records.add_reflection(
            passport,
            PASSPORT_ID,
            actor,
            schemas.Reflection(
                title="A difficult airway",
                written_on=date(2026, 3, 14),
                competencies=[
                    schemas.CompetencyRef(
                        id="perform_advanced_airway",
                        name="Advanced airway management",
                    )
                ],
            ),
            "Private.",
            now=NOW,
        )

        assert _read_index(passport).competencies == []


class TestCpd:
    def test_an_activity_is_grouped_by_year(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        """UK appraisal runs annually and asks what you did this year."""
        stem, _ = records.add_cpd_entry(
            passport,
            PASSPORT_ID,
            actor,
            schemas.CpdEntry(
                activity_on=date(2026, 2, 11),
                title="Regional oncology day",
                activity_type="conference",
                hours=6.5,
            ),
            now=NOW,
        )

        stored = serialise.from_yaml(
            schemas.CpdEntry,
            passport.read(PASSPORT_ID, paths.cpd_entry(2026, stem)),
        )
        assert stored.hours == 6.5

    def test_an_activity_does_not_reach_the_index(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        """The index is about competencies; CPD is about a year."""
        records.add_cpd_entry(
            passport,
            PASSPORT_ID,
            actor,
            schemas.CpdEntry(
                activity_on=date(2026, 2, 11),
                title="A conference",
                activity_type="conference",
            ),
            now=NOW,
        )

        assert _read_index(passport).competencies == []


class TestIndex:
    def test_it_counts_and_never_compares(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        """How many is enough is the assessor's judgement, not ours."""
        for day in (12, 13, 14):
            records.add_logbook_entry(
                passport,
                PASSPORT_ID,
                actor,
                "perform_bronchoscopy",
                schemas.LogbookEntry(performed_on=date(2026, 3, day)),
                now=NOW,
            )

        rendered = passport.read(PASSPORT_ID, paths.INDEX).decode()

        assert _entry(passport, "perform_bronchoscopy").logbook_entries == 3
        for forbidden in ("target", "required", "progress", "percentage"):
            assert forbidden not in rendered

    def test_it_says_not_to_edit_it(
        self, passport: store.LocalPassportStore
    ) -> None:
        """The one file where a hand edit is silently discarded."""
        rendered = passport.read(PASSPORT_ID, paths.INDEX).decode()

        assert "Do not edit" in rendered

    def test_a_hand_edit_is_overwritten_on_the_next_write(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        """The directories win, and this is what makes that true."""
        records.add_logbook_entry(
            passport,
            PASSPORT_ID,
            actor,
            "perform_bronchoscopy",
            schemas.LogbookEntry(performed_on=date(2026, 3, 12)),
            now=NOW,
        )

        # Someone edits the index to claim far more than is there.
        head = passport.head(PASSPORT_ID)
        tampered = schemas.Index(
            schema_version=1,
            generated_at=NOW,
            competencies=[
                schemas.IndexEntry(
                    id="perform_bronchoscopy",
                    name="Perform bronchoscopy",
                    status="signed_off",
                    logbook_entries=500,
                )
            ],
        )
        passport.write(
            PASSPORT_ID,
            {paths.INDEX: index.render(tampered)},
            commits.build("amend", "tamper", actor),
            actor,
            head,
        )

        records.add_logbook_entry(
            passport,
            PASSPORT_ID,
            actor,
            "perform_bronchoscopy",
            schemas.LogbookEntry(performed_on=date(2026, 3, 13)),
            now=NOW,
        )

        entry = _entry(passport, "perform_bronchoscopy")
        assert entry.logbook_entries == 2
        assert entry.status == "requested"

    def test_rebuilding_an_unchanged_passport_is_byte_identical(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        """Otherwise every write would show a spurious diff."""
        records.add_logbook_entry(
            passport,
            PASSPORT_ID,
            actor,
            "perform_bronchoscopy",
            schemas.LogbookEntry(performed_on=date(2026, 3, 12)),
            now=NOW,
        )

        first = index.render(index.build(passport, PASSPORT_ID, now=NOW))
        second = index.render(index.build(passport, PASSPORT_ID, now=NOW))

        assert first == second

    def test_competencies_are_listed_in_a_stable_order(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        for competency in ("request_ct_scan", "perform_cannulation"):
            records.add_logbook_entry(
                passport,
                PASSPORT_ID,
                actor,
                competency,
                schemas.LogbookEntry(performed_on=date(2026, 3, 12)),
                now=NOW,
            )

        listed = [entry.id for entry in _read_index(passport).competencies]

        assert listed == sorted(listed)

    def test_a_competency_with_evidence_but_no_sign_off_appears(
        self, passport: store.LocalPassportStore, actor: commits.Actor
    ) -> None:
        """An assessor should see that thirty procedures are logged and
        nothing has been signed."""
        records.add_logbook_entry(
            passport,
            PASSPORT_ID,
            actor,
            "perform_bronchoscopy",
            schemas.LogbookEntry(performed_on=date(2026, 3, 12)),
            now=NOW,
        )

        entry = _entry(passport, "perform_bronchoscopy")

        assert entry.status == "requested"
        assert entry.sign_off is None

    def test_refuses_a_naive_timestamp(
        self, passport: store.LocalPassportStore
    ) -> None:
        with pytest.raises(ValueError, match="naive"):
            index.build(
                passport,
                PASSPORT_ID,
                now=datetime(2026, 3, 14, 14, 32),  # noqa: DTZ001
            )
