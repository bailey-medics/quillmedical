"""Tests for app/features/passport/sync.py: framework files into tables."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.features.passport import sync
from app.features.passport.models import (
    PassportFrameworkCompetency,
    PassportFrameworkScope,
    PassportFrameworkSync,
    PassportFrameworkVersion,
)
from app.features.passport.sync import (
    FrameworkSyncError,
    read_repositories,
    read_repository_versions,
    sync_framework_versions,
    sync_frameworks,
    sync_from_repositories,
    sync_version_texts,
)

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
        "ghnft_radiotherapy_record": 1,
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


def test_a_version_dropping_a_scope_is_refused(
    db_session: Session, tmp_path: Path
) -> None:
    """A sign-off may name it, and a holder must be able to ask again."""
    directory = _sheet(tmp_path / "d")
    sync_frameworks(db_session, directory)
    text = _SHEET.format(version=2, words="Refer a patient").replace(
        '      - id: lung\n        name: "Lung"\n', ""
    )
    (directory / "sheet.yaml").write_text(text)

    result = sync_frameworks(db_session, directory)

    assert not result.succeeded
    assert "sheet_refer: scope lung" in (result.error or "")
    assert "never removed" in (result.error or "")


def test_a_version_adding_a_scope_is_stored(
    db_session: Session, tmp_path: Path
) -> None:
    directory = _sheet(tmp_path / "d")
    sync_frameworks(db_session, directory)
    text = _SHEET.format(version=2, words="Refer a patient").replace(
        "      - id: other\n",
        '      - id: breast\n        name: "Breast"\n      - id: other\n',
    )
    (directory / "sheet.yaml").write_text(text)

    assert sync_frameworks(db_session, directory).succeeded


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


# --- Catching up from the uploaded versions ---------------------------------
#
# The framework pipeline uploads every version as <framework>/<version>.yaml
# and never overwrites one. The sync reads every version the tables lack.


def _versions(root: Path, *numbers: int) -> Path:
    """Write sheet versions into root/sheet/, each a little different."""
    folder = root / "sheet"
    folder.mkdir(parents=True, exist_ok=True)

    for number in numbers:
        (folder / f"{number}.yaml").write_text(
            _SHEET.format(version=number, words=f"Refer, edition {number}")
        )

    return root


def test_the_sync_catches_up_on_every_missing_version(
    db_session: Session, tmp_path: Path
) -> None:
    root = _versions(tmp_path / "v", 1)
    sync_framework_versions(db_session, root)
    _versions(root, 2, 3)

    result = sync_framework_versions(db_session, root)

    stored = db_session.scalars(
        select(PassportFrameworkVersion.version).order_by(
            PassportFrameworkVersion.version
        )
    ).all()

    assert result.succeeded
    assert result.versions_written == 2
    assert stored == [1, 2, 3]


def test_a_first_catch_up_without_version_1_is_refused(
    db_session: Session, tmp_path: Path
) -> None:
    """A lost version 1 must not pass for a framework that began at 2."""
    result = sync_framework_versions(
        db_session, _versions(tmp_path / "v", 2, 3)
    )

    assert not result.succeeded
    assert "version 1 not found" in (result.error or "")
    assert _count(db_session, PassportFrameworkVersion) == 0


def test_a_framework_first_stored_above_version_1_is_refused(
    db_session: Session, tmp_path: Path
) -> None:
    result = sync_frameworks(db_session, _sheet(tmp_path / "d", version=3))

    assert not result.succeeded
    assert "starts at version 3" in (result.error or "")
    assert "versions 1, 2 are missing" in (result.error or "")
    assert _count(db_session, PassportFrameworkVersion) == 0


def test_a_gap_in_the_uploaded_versions_is_refused_and_named(
    db_session: Session, tmp_path: Path
) -> None:
    root = _versions(tmp_path / "v", 1)
    sync_framework_versions(db_session, root)
    _versions(root, 3, 4)

    result = sync_framework_versions(db_session, root)

    assert not result.succeeded
    assert "version 2 not found" in (result.error or "")
    assert _count(db_session, PassportFrameworkVersion) == 1


def test_a_catch_up_writes_all_or_nothing(
    db_session: Session, tmp_path: Path
) -> None:
    """Version 2 is good and version 3 is not, so neither is written."""
    root = _versions(tmp_path / "v", 1)
    sync_framework_versions(db_session, root)
    _versions(root, 2, 3)
    bad = (
        (root / "sheet" / "3.yaml")
        .read_text()
        .replace("sheet_refer", "sheet_plan")
    )
    (root / "sheet" / "3.yaml").write_text(bad)

    result = sync_framework_versions(db_session, root)

    assert "deleted competencies" in (result.error or "")
    assert _count(db_session, PassportFrameworkVersion) == 1


def test_a_file_named_for_another_version_is_refused(
    db_session: Session, tmp_path: Path
) -> None:
    root = _versions(tmp_path / "v", 1, 2)
    folder = root / "sheet"
    (folder / "2.yaml").write_text((folder / "1.yaml").read_text())

    result = sync_framework_versions(db_session, root)

    assert "declares version 1" in (result.error or "")


def test_a_file_not_named_for_a_version_is_refused(
    db_session: Session, tmp_path: Path
) -> None:
    root = _versions(tmp_path / "v", 1)
    (root / "sheet" / "1.yaml").rename(root / "sheet" / "latest.yaml")

    result = sync_framework_versions(db_session, root)

    assert "not named for a version" in (result.error or "")


def test_a_stored_version_that_differs_from_its_file_is_refused(
    db_session: Session, tmp_path: Path
) -> None:
    """A version rewritten on main must not go unnoticed."""
    root = _versions(tmp_path / "v", 1)
    sync_framework_versions(db_session, root)
    rewritten = _SHEET.format(version=1, words="Refer someone else")
    (root / "sheet" / "1.yaml").write_text(rewritten)

    result = sync_framework_versions(db_session, root)

    assert not result.succeeded
    assert "version 1 differs from the version stored" in (result.error or "")


def test_versions_are_caught_up_from_their_text(
    db_session: Session,
) -> None:
    """The form the sync job uses, reading each file from git history."""
    texts = {
        number: _SHEET.format(version=number, words=f"Refer {number}")
        for number in (1, 2)
    }

    result = sync_version_texts(db_session, {"sheet": texts})

    assert result.succeeded
    assert result.versions_written == 2


def test_versions_already_stored_are_left_alone(
    db_session: Session, tmp_path: Path
) -> None:
    root = _versions(tmp_path / "v", 1, 2)
    sync_framework_versions(db_session, root)

    again = sync_framework_versions(db_session, root)

    assert again.succeeded
    assert again.versions_written == 0


# --- Reading the framework repositories ----------------------------------------


def _git(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", *args], cwd=repo, capture_output=True, text=True, check=True
    )


def _repository(tmp_path: Path, name: str = "origin") -> Path:
    """An empty repository on main, to commit framework files into."""
    repo = tmp_path / name
    repo.mkdir(parents=True)
    _git(repo, "init", "--initial-branch=main")
    _git(repo, "config", "user.email", "test@example.com")
    _git(repo, "config", "user.name", "Test")

    return repo


def _commit(repo: Path, text: str, name: str = "sheet") -> None:
    """Commit one framework file on main, as a merge would leave it."""
    folder = repo / "frameworks"
    folder.mkdir(exist_ok=True)
    (folder / f"{name}.yaml").write_text(text)
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "A change")


@pytest.fixture
def local_clones(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """Let the sync clone local repositories, named owner/name under here."""
    root = tmp_path / "github"
    root.mkdir()
    monkeypatch.setattr(sync, "_CLONE_PROTOCOL", "file")
    monkeypatch.setattr(sync, "_repository_url", lambda name: str(root / name))

    return root


def test_every_version_is_read_from_main_s_history(
    local_clones: Path, tmp_path: Path
) -> None:
    repo = _repository(local_clones / "owner", "sheet-framework")
    _commit(repo, _SHEET.format(version=1, words="Refer a patient"))
    _commit(repo, _SHEET.format(version=2, words="Refer two patients"))
    # A description changed alone keeps its version, so it is not read.
    _commit(
        repo,
        _SHEET.format(version=2, words="Refer two patients").replace(
            "Pilot edition.", "Second edition."
        ),
    )

    versions = read_repository_versions(
        "owner/sheet-framework", {"sheet"}, tmp_path / "clone"
    )

    assert sorted(versions["sheet"]) == [1, 2]
    assert "Refer two patients" in versions["sheet"][2]
    assert "Pilot edition." in versions["sheet"][2]


def test_a_framework_the_repository_may_not_publish_is_refused(
    local_clones: Path, tmp_path: Path
) -> None:
    """One publisher must not add a version to another's framework."""
    repo = _repository(local_clones / "owner", "other-framework")
    _commit(repo, _SHEET.format(version=1, words="Refer a patient"))

    with pytest.raises(FrameworkSyncError, match="may publish only other"):
        read_repository_versions(
            "owner/other-framework", {"other"}, tmp_path / "clone"
        )


def test_a_repository_with_no_main_yet_holds_nothing(
    local_clones: Path, tmp_path: Path
) -> None:
    _repository(local_clones / "owner", "empty-framework")

    versions = read_repository_versions(
        "owner/empty-framework", {"sheet"}, tmp_path / "clone"
    )

    assert versions == {}


def test_a_framework_file_too_large_is_refused_before_it_is_read(
    local_clones: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(sync, "MAX_FRAMEWORK_FILE_BYTES", 10)
    repo = _repository(local_clones / "owner", "big-framework")
    _commit(repo, _SHEET.format(version=1, words="Refer a patient"))

    with pytest.raises(FrameworkSyncError, match="larger than 10 bytes"):
        read_repository_versions(
            "owner/big-framework", {"sheet"}, tmp_path / "clone"
        )


def test_a_repository_not_named_owner_slash_name_is_refused(
    tmp_path: Path,
) -> None:
    """So a setting cannot point the clone at a path or another host."""
    with pytest.raises(FrameworkSyncError, match="not a repository named"):
        read_repository_versions("../etc", {"sheet"}, tmp_path / "clone")


def test_only_https_may_be_cloned(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A local path is a file clone, which the sync job never allows."""
    local = _repository(tmp_path / "owner", "sheet-framework")
    _commit(local, _SHEET.format(version=1, words="Refer a patient"))
    monkeypatch.setattr(sync, "_repository_url", lambda name: str(local))

    with pytest.raises(FrameworkSyncError, match="git clone failed"):
        sync._clone("owner/sheet-framework", tmp_path / "clone")


def test_one_framework_paired_with_two_repositories_is_refused(
    tmp_path: Path,
) -> None:
    with pytest.raises(FrameworkSyncError, match="paired with both"):
        read_repositories(
            {"owner/a-framework": ["sheet"], "owner/b-framework": ["sheet"]},
            tmp_path,
        )


def test_the_repository_sync_stores_every_version_it_read(
    db_session: Session, local_clones: Path
) -> None:
    repo = _repository(local_clones / "owner", "sheet-framework")
    _commit(repo, _SHEET.format(version=1, words="Refer a patient"))
    _commit(repo, _SHEET.format(version=2, words="Refer two patients"))

    result = sync_from_repositories(
        db_session, {"owner/sheet-framework": ["sheet"]}
    )

    assert result.succeeded
    assert result.versions_written == 2


class _Dialect:
    def __init__(self, name: str) -> None:
        self.name = name


class _RecordingSession:
    """Stands in for a session: keeps each statement it is sent.

    The unit tests run on SQLite, which has no advisory locks, so what can
    be checked here is the statement. That a second run really waits is
    checked on Postgres, in ``tests/framework_sync_role_test.py``.
    """

    def __init__(self, dialect: str) -> None:
        self.statements: list[str] = []
        self.parameters: list[dict[str, int]] = []
        self._dialect = _Dialect(dialect)

    def get_bind(self) -> _RecordingSession:
        return self

    @property
    def dialect(self) -> _Dialect:
        return self._dialect

    def execute(self, statement: object, parameters: dict[str, int]) -> None:
        self.statements.append(str(statement))
        self.parameters.append(parameters)


def test_a_run_takes_the_sync_lock_on_postgres() -> None:
    session = _RecordingSession("postgresql")

    sync._one_sync_at_a_time(session)  # type: ignore[arg-type]

    assert session.statements == [
        "SELECT pg_advisory_xact_lock(:namespace, :key)"
    ]
    assert session.parameters == [
        {"namespace": sync.SYNC_LOCK_NAMESPACE, "key": sync.SYNC_LOCK_KEY}
    ]


def test_the_sync_lock_is_not_the_passports() -> None:
    """Its own namespace, so a sync never waits on a passport write."""
    from app.features.passport.locking import LOCK_NAMESPACE

    assert sync.SYNC_LOCK_NAMESPACE != LOCK_NAMESPACE


def test_a_database_with_no_advisory_locks_is_sent_nothing() -> None:
    session = _RecordingSession("sqlite")

    sync._one_sync_at_a_time(session)  # type: ignore[arg-type]

    assert session.statements == []
