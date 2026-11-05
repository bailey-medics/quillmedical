"""What happens when a level or scope leaves a framework, traced.

A sign-off keeps the level and scope it was given at. If a later version
of the framework drops that level or scope id, a write that looks the
old id up in the catalogue may fail. Each test here takes one write path,
with a sign-off made under the framework as it was, and the catalogue as
it is after the id has gone. See Phase 11 of
docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md.
"""

from __future__ import annotations

import dataclasses
from datetime import UTC, date, datetime
from pathlib import Path

import pytest

from app.cbac.competencies import CompetencyEntry
from app.features.passport import commits, definitions, service, store
from app.features.passport.catalogue import StoredCatalogue
from tests.frameworks import files_catalogue

PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"
NOW = datetime(2026, 3, 14, 14, 32, tzinfo=UTC)
SACT = "uk_sact_board_2023_prescribe_sact"
DROPPED_LEVEL = "review_and_authorise"
HIGHER_LEVEL = "prescribe_subsequent_cycles"
DROPPED_SCOPE = "lung"

HOLDER = commits.Actor(
    name="Dr Sam Reeve", role="Registrar", email="s@x.nhs.uk"
)
ASSESSOR = commits.Actor(
    name="Dr Amara Okonkwo", role="Consultant", email="a@x.nhs.uk"
)


def _without(
    *, level: str | None = None, scope: str | None = None
) -> StoredCatalogue:
    """The fixtures, with one level or scope gone from the SACT competency."""
    held = files_catalogue()
    entry = held.entries[SACT]
    changed: CompetencyEntry = entry.model_copy(
        update={
            "levels": [lvl for lvl in entry.levels or [] if lvl.id != level],
            "scopes": [sc for sc in entry.scopes or [] if sc.id != scope],
        }
    )

    return dataclasses.replace(
        held,
        entries={**held.entries, SACT: changed},
        competencies={
            **held.competencies,
            changed.framework_id
            or "": [
                changed if e.id == SACT else e
                for e in held.competencies[changed.framework_id or ""]
            ],
        },
    )


@pytest.fixture
def passport(tmp_path: Path) -> store.LocalPassportStore:
    made = store.LocalPassportStore(tmp_path)
    service.create_passport(
        made, PASSPORT_ID, HOLDER, user_id="u-holder", now=NOW
    )

    return made


def _ask(
    passport: store.LocalPassportStore,
    catalogue: StoredCatalogue,
    level_id: str,
    observed_on: date,
) -> str:
    name, _ = service.request_sign_off(
        passport,
        PASSPORT_ID,
        HOLDER,
        catalogue=catalogue,
        competency_id=SACT,
        observed_on=observed_on,
        level_id=level_id,
        scope_id=DROPPED_SCOPE,
        now=NOW,
    )

    return name


def _sign(
    passport: store.LocalPassportStore,
    catalogue: StoredCatalogue,
    name: str,
) -> str:
    return service.sign_off(
        passport,
        PASSPORT_ID,
        ASSESSOR,
        catalogue=catalogue,
        name=name,
        assessor_user_id="u-assessor",
        holder_user_id="u-holder",
        meaning="directly observed",
        declaration_confirmed=True,
        registrations=[],
        now=NOW,
    )


@pytest.mark.xfail(
    strict=True,
    raises=definitions.UnknownLevelError,
    reason=(
        "Fails: the kind of the new sign-off is worked out by comparing its "
        "level with the last one's, which the framework no longer lists. "
        "So a framework may never drop a level: the sync and the version "
        "check refuse one that does, and retiring a level is a later step "
        "of Phase 11."
    ),
)
def test_asking_again_at_a_higher_level_after_the_old_one_went(
    passport: store.LocalPassportStore,
) -> None:
    """The kind of the new sign-off compares it with the last level."""
    signed = _ask(passport, files_catalogue(), DROPPED_LEVEL, date(2026, 3, 1))
    _sign(passport, files_catalogue(), signed)

    _ask(
        passport,
        _without(level=DROPPED_LEVEL),
        HIGHER_LEVEL,
        date(2026, 3, 10),
    )


def test_signing_a_request_whose_level_went_while_it_waited(
    passport: store.LocalPassportStore,
) -> None:
    """The assessor signs what was asked, which names the dropped level."""
    asked = _ask(passport, files_catalogue(), DROPPED_LEVEL, date(2026, 3, 1))

    _sign(passport, _without(level=DROPPED_LEVEL), asked)


def test_signing_a_request_whose_scope_went_while_it_waited(
    passport: store.LocalPassportStore,
) -> None:
    asked = _ask(passport, files_catalogue(), DROPPED_LEVEL, date(2026, 3, 1))

    _sign(passport, _without(scope=DROPPED_SCOPE), asked)


def test_asking_for_a_scope_that_went_is_refused(
    passport: store.LocalPassportStore,
) -> None:
    """Nothing new may be recorded against an id the framework dropped."""
    with pytest.raises(definitions.UnknownScopeError):
        _ask(
            passport,
            _without(scope=DROPPED_SCOPE),
            DROPPED_LEVEL,
            date(2026, 3, 1),
        )
