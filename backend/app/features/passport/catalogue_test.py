"""Tests for app/features/passport/catalogue.py: the stored frameworks."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.features.passport import catalogue
from app.features.passport.catalogue import stored_catalogue
from app.features.passport.sync import sync_frameworks
from tests.frameworks import files_catalogue

_SHEET = """\
framework:
  id: sheet
  name: "A sign-off sheet"
  publisher: "A trust"
  version: {version}
  description: "Pilot edition."
  specialties: [oncology, haematology]

competencies:
  - id: sheet_refer
    display_name: "{words}"
    assessable: true
    levels:
      - id: observed
        name: "Observed"
      - id: independent
        name: "Independent"
  - id: sheet_plan
    display_name: "Plan"
    assessable: true
    scopes:
      - id: lung
        name: "Lung"
      - id: other
        name: "Other"
"""


def _store(db: Session, folder: Path, version: int, words: str) -> None:
    folder.mkdir(exist_ok=True)
    (folder / "sheet.yaml").write_text(
        _SHEET.format(version=version, words=words)
    )
    result = sync_frameworks(db, folder)
    assert result.succeeded, result.error


def test_nothing_stored_gives_an_empty_catalogue(db_session: Session) -> None:
    held = stored_catalogue(db_session)

    assert held.frameworks == {}
    assert held.entries == {}


def test_the_real_frameworks_come_back_as_the_files_hold_them(
    stored_frameworks: Session,
) -> None:
    """The reader must be a drop-in for the loader, framework by framework."""
    held = stored_catalogue(stored_frameworks)

    in_files = files_catalogue()

    assert held.frameworks == in_files.frameworks
    assert held.competencies == in_files.competencies
    assert held.entries == in_files.entries


def test_a_competency_is_found_by_its_id(stored_frameworks: Session) -> None:
    held = stored_catalogue(stored_frameworks)

    entry = held.entries["ghnft_radiotherapy_record_refer_palliative"]

    assert entry.framework_id == "ghnft_radiotherapy_record"
    assert entry.assessable is True


def test_levels_scopes_and_specialties_keep_their_order(
    db_session: Session, tmp_path: Path
) -> None:
    _store(db_session, tmp_path / "d", 1, "Refer")

    held = stored_catalogue(db_session)
    refer, plan = held.competencies["sheet"]

    assert held.frameworks["sheet"].specialties == ["oncology", "haematology"]
    assert [lvl.id for lvl in refer.levels or []] == [
        "observed",
        "independent",
    ]
    assert refer.scopes is None
    assert plan.levels is None
    assert [sc.id for sc in plan.scopes or []] == ["lung", "other"]


def test_the_newest_version_is_the_one_read(
    db_session: Session, tmp_path: Path
) -> None:
    _store(db_session, tmp_path / "d", 1, "Refer")
    _store(db_session, tmp_path / "d", 2, "Refer a patient")

    held = stored_catalogue(db_session)

    assert held.frameworks["sheet"].version == 2
    assert held.entries["sheet_refer"].display_name == "Refer a patient"


def test_every_stored_version_is_known(
    db_session: Session, tmp_path: Path
) -> None:
    """So a sign-off naming an older version can be checked as held."""
    _store(db_session, tmp_path / "d", 1, "Refer")
    _store(db_session, tmp_path / "d", 2, "Refer a patient")

    assert stored_catalogue(db_session).versions["sheet"] == {1, 2}


def test_a_second_read_with_nothing_new_uses_the_cache(
    db_session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _store(db_session, tmp_path / "d", 1, "Refer")
    loads: list[int] = []
    real_load = catalogue._load

    def counting_load(db: Session) -> catalogue.StoredCatalogue:
        loads.append(1)
        return real_load(db)

    monkeypatch.setattr(catalogue, "_load", counting_load)

    stored_catalogue(db_session)
    stored_catalogue(db_session)

    assert len(loads) == 1


def test_a_version_stored_since_is_read_at_once(
    db_session: Session, tmp_path: Path
) -> None:
    """The sync job may store one between deploys."""
    _store(db_session, tmp_path / "d", 1, "Refer")
    assert stored_catalogue(db_session).frameworks["sheet"].version == 1

    _store(db_session, tmp_path / "d", 2, "Refer a patient")

    assert stored_catalogue(db_session).frameworks["sheet"].version == 2


def test_a_retired_level_comes_back_marked(
    db_session: Session, tmp_path: Path
) -> None:
    _store(db_session, tmp_path / "d", 1, "Refer")
    folder = tmp_path / "d"
    text = _SHEET.format(version=2, words="Refer").replace(
        '      - id: observed\n        name: "Observed"\n',
        '      - id: observed\n        name: "Observed"\n'
        "        retired_on: 2026-11-04\n"
        "        retired_in_version: 2\n",
    )
    (folder / "sheet.yaml").write_text(text)
    assert sync_frameworks(db_session, folder).succeeded

    refer = stored_catalogue(db_session).entries["sheet_refer"]

    observed = (refer.levels or [])[0]
    assert observed.id == "observed"
    assert observed.retired_in_version == 2
