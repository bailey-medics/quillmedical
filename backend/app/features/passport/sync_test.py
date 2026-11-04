"""Tests for app/features/passport/sync.py: framework files into tables."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.features.passport.models import (
    PassportFrameworkCompetency,
    PassportFrameworkScope,
    PassportFrameworkSync,
    PassportFrameworkVersion,
)
from app.features.passport.sync import sync_frameworks

_SHEET = """\
framework:
  id: sheet
  name: "A sign-off sheet"
  publisher: "A trust"
  version: {version}
  description: "Pilot edition."
  specialties: [oncology]

competencies:
  - id: sheet_refer
    display_name: "{words}"
    assessable: true
    scopes:
      - id: lung
        name: "Lung"
      - id: other
        name: "Other"
"""


def _sheet(
    directory: Path, *, version: int = 1, words: str = "Refer a patient"
) -> Path:
    directory.mkdir(exist_ok=True)
    (directory / "sheet.yaml").write_text(
        _SHEET.format(version=version, words=words)
    )

    return directory


def _count(db: Session, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


def test_the_real_frameworks_are_stored(db_session: Session) -> None:
    """The four frameworks in shared/, each at its version."""
    result = sync_frameworks(db_session)

    versions = dict(
        db_session.execute(
            select(
                PassportFrameworkVersion.framework_id,
                PassportFrameworkVersion.version,
            )
        ).all()
    )

    assert result.succeeded
    assert versions == {
        "clinical": 1,
        "ghnft_radiotherapy_record": 2,
        "ruh_sact_passport": 1,
        "uk_sact_board_2023": 1,
    }


def test_a_framework_is_stored_whole(
    db_session: Session, tmp_path: Path
) -> None:
    result = sync_frameworks(db_session, _sheet(tmp_path / "d"))

    competency = db_session.scalars(select(PassportFrameworkCompetency)).one()
    scopes = db_session.scalars(
        select(PassportFrameworkScope.scope_id).order_by(
            PassportFrameworkScope.position
        )
    ).all()

    assert result.versions_written == 1
    assert competency.competency_id == "sheet_refer"
    assert competency.display_name == "Refer a patient"
    assert scopes == ["lung", "other"]


def test_a_second_run_changes_nothing(
    db_session: Session, tmp_path: Path
) -> None:
    directory = _sheet(tmp_path / "d")
    sync_frameworks(db_session, directory)

    again = sync_frameworks(db_session, directory)

    assert again.succeeded
    assert again.versions_written == 0
    assert _count(db_session, PassportFrameworkVersion) == 1


def test_the_description_alone_needs_no_new_version(
    db_session: Session, tmp_path: Path
) -> None:
    directory = _sheet(tmp_path / "d")
    sync_frameworks(db_session, directory)
    text = (directory / "sheet.yaml").read_text()
    (directory / "sheet.yaml").write_text(
        text.replace("Pilot edition.", "Second print.")
    )

    assert sync_frameworks(db_session, directory).succeeded


def test_a_new_version_is_added_and_the_old_one_kept(
    db_session: Session, tmp_path: Path
) -> None:
    directory = _sheet(tmp_path / "d")
    sync_frameworks(db_session, directory)
    _sheet(directory, version=2, words="Refer patients")

    result = sync_frameworks(db_session, directory)

    names = db_session.scalars(
        select(PassportFrameworkCompetency.display_name).order_by(
            PassportFrameworkCompetency.id
        )
    ).all()

    assert result.versions_written == 1
    assert names == ["Refer a patient", "Refer patients"]


def test_a_change_with_no_new_version_is_refused(
    db_session: Session, tmp_path: Path
) -> None:
    directory = _sheet(tmp_path / "d")
    sync_frameworks(db_session, directory)
    _sheet(directory, words="Refer patients")

    result = sync_frameworks(db_session, directory)

    assert not result.succeeded
    assert "still version 1" in (result.error or "")


def test_a_skipped_version_is_refused(
    db_session: Session, tmp_path: Path
) -> None:
    directory = _sheet(tmp_path / "d")
    sync_frameworks(db_session, directory)
    _sheet(directory, version=3, words="Refer patients")

    result = sync_frameworks(db_session, directory)

    assert "version 2 is missing" in (result.error or "")
    assert "git history" in (result.error or "")


def test_every_skipped_version_is_named(
    db_session: Session, tmp_path: Path
) -> None:
    directory = _sheet(tmp_path / "d")
    sync_frameworks(db_session, directory)
    _sheet(directory, version=4, words="Refer patients")

    result = sync_frameworks(db_session, directory)

    assert "versions 2, 3 are missing" in (result.error or "")


def test_a_skipped_version_rebuilt_lets_the_sync_go_on(
    db_session: Session, tmp_path: Path
) -> None:
    """Following the refusal's own advice works."""
    directory = _sheet(tmp_path / "d")
    sync_frameworks(db_session, directory)
    _sheet(directory, version=3, words="Refer two patients")
    sync_frameworks(db_session, directory)

    rebuilt = sync_frameworks(
        db_session, _sheet(tmp_path / "v2", version=2, words="Refer patients")
    )
    after = sync_frameworks(db_session, directory)

    assert rebuilt.succeeded
    assert after.succeeded
    assert _count(db_session, PassportFrameworkVersion) == 3


def test_a_lower_version_is_refused(
    db_session: Session, tmp_path: Path
) -> None:
    directory = _sheet(tmp_path / "d")
    sync_frameworks(db_session, directory)
    _sheet(directory, version=2, words="Refer patients")
    sync_frameworks(db_session, directory)
    _sheet(directory, version=1)

    result = sync_frameworks(db_session, directory)

    assert "never goes down" in (result.error or "")


def test_a_deleted_competency_is_refused(
    db_session: Session, tmp_path: Path
) -> None:
    directory = _sheet(tmp_path / "d")
    sync_frameworks(db_session, directory)
    text = _SHEET.format(version=2, words="x").replace(
        "sheet_refer", "sheet_plan"
    )
    (directory / "sheet.yaml").write_text(text)

    result = sync_frameworks(db_session, directory)

    assert "deleted competencies" in (result.error or "")
    assert "sheet_refer" in (result.error or "")


def test_a_permissions_id_is_refused(
    db_session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A framework from another repository could name one by mistake."""
    from app.features.passport import sync

    permission = next(c for c in sync.COMPETENCIES if c.framework_id is None)
    monkeypatch.setattr(
        sync,
        "COMPETENCIES",
        [
            *sync.COMPETENCIES,
            permission.model_copy(update={"id": "sheet_refer"}),
        ],
    )

    result = sync_frameworks(db_session, _sheet(tmp_path / "d"))

    assert "permission ids" in (result.error or "")


def test_a_refusal_writes_nothing_and_is_recorded(
    db_session: Session, tmp_path: Path
) -> None:
    directory = _sheet(tmp_path / "d")
    sync_frameworks(db_session, directory)
    _sheet(directory, version=3)

    sync_frameworks(db_session, directory)

    runs = db_session.scalars(
        select(PassportFrameworkSync.status).order_by(PassportFrameworkSync.id)
    ).all()

    assert runs == ["succeeded", "failed"]
    assert _count(db_session, PassportFrameworkVersion) == 1
