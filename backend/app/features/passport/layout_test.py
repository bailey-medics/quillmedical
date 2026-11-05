"""Tests for app/features/passport/layout.py: finding folders by looking."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path, PurePosixPath

import pytest

from app.features.passport import (
    commits,
    index,
    layout,
    paths,
    records,
    schemas,
    store,
)
from tests.frameworks import files_catalogue

PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"
NOW = datetime(2026, 3, 14, 14, 32, 7, tzinfo=UTC)
CANNULATION = "clinical_perform_cannulation"


@pytest.fixture
def actor() -> commits.Actor:
    return commits.Actor(
        name="Dr Sam Reeve", role="Registrar", email="sam@example.nhs.uk"
    )


def _passport(
    tmp_path: Path, actor: commits.Actor, manifest: str
) -> store.LocalPassportStore:
    created = store.LocalPassportStore(tmp_path)
    empty = index.render(
        schemas.Index(schema_version=2, generated_at=NOW, competencies=[])
    )
    created.create(
        PASSPORT_ID,
        store.initial_files(manifest, "user_id: y\n", empty),
        commits.build("create", "new passport", actor),
        actor,
    )

    return created


@pytest.fixture
def passport(tmp_path: Path, actor: commits.Actor) -> store.LocalPassportStore:
    return _passport(tmp_path, actor, "passport_id: x\n")


def _write(
    passport: store.LocalPassportStore,
    actor: commits.Actor,
    files: dict[PurePosixPath, str],
) -> None:
    passport.write(
        PASSPORT_ID,
        files,
        commits.build("create", "by hand", actor),
        actor,
        passport.head(PASSPORT_ID),
    )


def test_a_first_record_is_placed_by_the_catalogue(
    passport: store.LocalPassportStore,
) -> None:
    assert layout.framework_for(
        passport, PASSPORT_ID, CANNULATION, files_catalogue()
    ) == ("clinical")


def test_a_competency_filed_nowhere_has_nothing_to_read(
    passport: store.LocalPassportStore,
) -> None:
    """A read is given no catalogue, so nothing filed is nothing found."""
    with pytest.raises(layout.NothingFiledError, match="no record"):
        layout.framework_for(passport, PASSPORT_ID, CANNULATION)


def test_a_competency_already_filed_is_found_where_it_is(
    passport: store.LocalPassportStore, actor: commits.Actor
) -> None:
    """Looking wins over the catalogue, so a record stays readable."""
    _write(
        passport,
        actor,
        {
            paths.logbook_entry(
                "somewhere_else", CANNULATION, "2026-03-14-143207"
            ): "performed_on: 2026-03-12\n"
        },
    )

    assert layout.framework_for(passport, PASSPORT_ID, CANNULATION) == (
        "somewhere_else"
    )
    assert layout.logbook_dir(passport, PASSPORT_ID, CANNULATION) == (
        paths.logbook_dir("somewhere_else", CANNULATION)
    )


def test_a_permission_has_nowhere_to_be_filed(
    passport: store.LocalPassportStore,
) -> None:
    with pytest.raises(paths.PassportPathError, match="no framework"):
        layout.framework_for(
            passport, PASSPORT_ID, "perform_cannulation", files_catalogue()
        )


def test_a_logbook_entry_lands_under_its_framework_and_competency(
    passport: store.LocalPassportStore, actor: commits.Actor
) -> None:
    records.add_logbook_entry(
        passport,
        PASSPORT_ID,
        actor,
        CANNULATION,
        schemas.LogbookEntry(performed_on=NOW.date()),
        catalogue=files_catalogue(),
        now=NOW,
    )

    assert layout.logbook_dirs(passport, PASSPORT_ID) == [
        (CANNULATION, paths.logbook_dir("clinical", CANNULATION))
    ]


def test_every_sign_off_is_listed_by_its_id(
    passport: store.LocalPassportStore, actor: commits.Actor
) -> None:
    _write(
        passport,
        actor,
        {
            paths.sign_off_file(
                "clinical", f"{CANNULATION}.2026-03-14"
            ): "id: 1\n",
            paths.sign_off_file(
                "clinical", f"{CANNULATION}.2026-03-14-2"
            ): "id: 2\n",
            paths.sign_offs_dir("clinical", CANNULATION)
            / "notes"
            / "sign-off.yaml": "id: 3\n",
        },
    )

    assert layout.sign_off_ids(passport, PASSPORT_ID) == [
        f"{CANNULATION}.2026-03-14",
        f"{CANNULATION}.2026-03-14-2",
    ]
    assert layout.sign_off_folders(passport, PASSPORT_ID, CANNULATION) == [
        "2026-03-14",
        "2026-03-14-2",
        "notes",
    ]


def test_a_passport_in_the_old_layout_is_refused(
    tmp_path: Path, actor: commits.Actor
) -> None:
    """Refused, never listed as if it held nothing."""
    old = _passport(tmp_path, actor, "passport_id: x\nschema_version: 1\n")

    with pytest.raises(layout.OutdatedPassportError, match="version 1"):
        layout.sign_off_ids(old, PASSPORT_ID)

    with pytest.raises(layout.OutdatedPassportError):
        layout.logbook_dirs(old, PASSPORT_ID)


def test_a_passport_at_the_current_version_is_read(
    tmp_path: Path, actor: commits.Actor
) -> None:
    current = _passport(
        tmp_path,
        actor,
        f"passport_id: x\nschema_version: {schemas.SCHEMA_VERSION}\n",
    )

    assert layout.sign_off_ids(current, PASSPORT_ID) == []
