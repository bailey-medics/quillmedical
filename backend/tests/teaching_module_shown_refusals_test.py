"""What a learner is shown of a module, through the three routes.

``GET /question-banks``, ``GET /question-banks/{bank_id}`` and
``GET /modules/{module_id}/learning``. The rules are tested on their own
in ``app/features/teaching/access_test.py``, ``listing_test.py`` and
``module_content_test.py``; this says what a caller is told, in which
words, and pins where the three routes do not ask the same question.

They differ in three things, and each is pinned below as it stands:

- **Closed to new attempts.** The learning pages are refused for a
  module that is not live. The list and the detail show a closed bank
  to somebody enrolled on it, and say it is closed.
- **No version promoted.** The list and the detail hide a bank with no
  version promoted. The learning pages do not ask.
- **Nowhere to take modules.** The list is empty, the detail answers
  403 and the learning pages answer 404.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.features.teaching.enrolment import withdraw
from app.features.teaching.models import (
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.models import OrgUnit, OrgUnitFeature, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.competencies import join_for_teaching

BANKS = "/api/teaching/question-banks"
BANK = "polyps"
DETAIL = f"{BANKS}/{BANK}"
LEARNING = f"/api/teaching/modules/{BANK}/learning"

PASSWORD = "Password123!"  # noqa: S105
CONFIG = {"id": BANK, "assessment": {"items_per_attempt": 3}}

BANK_NOT_FOUND = {"detail": "Question bank not found"}
MODULE_NOT_FOUND = {"detail": "Module not found"}
NO_LEARNING = {"detail": "No learning content for this module"}


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    """An organisation with teaching on, serving nothing yet."""
    org = OrgUnit(name="Shown Test Trust", type="organisation")
    db_session.add(org)
    db_session.flush()
    db_session.add(
        OrgUnitFeature(
            org_unit_id=org.id, feature_key="teaching", enabled_by=1
        )
    )
    db_session.flush()

    return org


def _serve(
    db: Session,
    org: OrgUnit,
    *,
    active_version: int | None = 1,
    is_live: bool = True,
    synced: bool = True,
) -> None:
    """Have *org* serve the bank, with one version synced into it."""
    db.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=BANK,
            is_live=is_live,
            active_version=active_version,
        )
    )

    if synced:
        db.add(
            QuestionBankConfig(
                org_unit_id=org.id,
                question_bank_id=BANK,
                version=1,
                title="Polyps",
                description="A question bank.",
                type="uniform",
                config_yaml=CONFIG,
            )
        )
    db.flush()


def _delegate(db: Session, name: str = "learner") -> User:
    """A delegate, who holds both learner competencies, belonging nowhere."""
    user = User(
        username=name,
        email=f"{name}@test.local",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession="teaching_delegate",
    )
    db.add(user)
    db.flush()

    return user


def _learner(db: Session, org: OrgUnit, name: str = "learner") -> User:
    """A delegate with a place at *org*, enrolled on what it serves now."""
    user = _delegate(db, name)
    join_for_teaching(db, org.id, user.id, "trainee")
    db.commit()

    return user


def _signed_in(client: TestClient, name: str = "learner") -> TestClient:
    resp = client.post(
        "/api/auth/login", json={"username": name, "password": PASSWORD}
    )
    assert resp.status_code == 200, resp.text

    return client


def _end_enrolment(db: Session, user: User, org: OrgUnit) -> None:
    withdraw(db, user.id, org_unit_id=org.id, question_bank_id=BANK)
    db.commit()


def _media(monkeypatch: pytest.MonkeyPatch, *, complete: bool) -> None:
    monkeypatch.setattr(
        "app.features.teaching.media.module_media_is_complete",
        lambda db, organisation_id, module_id: complete,
    )


def _bucket(monkeypatch: pytest.MonkeyPatch, mdx: str | None) -> list[str]:
    """A bucket holding the module's pages, and each read made of it."""
    read: list[str] = []

    def yaml_of(bucket: str, module_id: str) -> dict[str, object]:
        read.append(f"yaml {module_id}")

        return {"title": "Polyps"}

    def mdx_of(bucket: str, module_id: str) -> str | None:
        read.append(f"mdx {module_id}")

        return mdx

    monkeypatch.setattr("app.config.settings.TEACHING_GCS_BUCKET", "bucket")
    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", None
    )
    monkeypatch.setattr(
        "app.features.teaching.storage.download_module_yaml_from_gcs",
        yaml_of,
    )
    monkeypatch.setattr(
        "app.features.teaching.storage.download_learning_mdx_from_gcs",
        mdx_of,
    )

    return read


def _on_disk(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    *,
    module: bool = True,
    slides: str | None = None,
) -> None:
    """A content repository on disk, and no bucket."""
    modules = tmp_path / "content-repo" / "modules"
    modules.mkdir(parents=True)

    if module:
        (modules / BANK).mkdir()
        (modules / BANK / "module.yaml").write_text(
            "title: On disk\n", encoding="utf-8"
        )

    if slides is not None:
        (modules / BANK / "learning").mkdir()
        (modules / BANK / "learning" / "content.mdx").write_text(
            slides, encoding="utf-8"
        )

    monkeypatch.setattr("app.config.settings.TEACHING_GCS_BUCKET", None)
    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", str(tmp_path)
    )


# --- GET /question-banks/{bank_id} ------------------------------------------


@pytest.mark.parametrize("bank_id", ["bad.id", "bad id", "bad$id"])
def test_a_bank_id_that_could_not_be_one_is_refused(
    test_client: TestClient, db_session: Session, trust: OrgUnit, bank_id: str
) -> None:
    _learner(db_session, trust)

    resp = _signed_in(test_client).get(f"{BANKS}/{bank_id}")

    assert resp.status_code == 400
    assert resp.json() == {"detail": "Invalid bank_id"}


def test_somebody_with_nowhere_to_take_modules_is_told_of_a_bad_id_first(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """The id is checked before the caller's organisations are."""
    _serve(db_session, trust)
    member = _delegate(db_session)
    add_org_unit_member(db_session, trust.id, member.id, "trainee")
    db_session.commit()
    client = _signed_in(test_client)

    bad = client.get(f"{BANKS}/bad.id")
    good = client.get(DETAIL)

    assert (bad.status_code, bad.json()) == (
        400,
        {"detail": "Invalid bank_id"},
    )
    assert (good.status_code, good.json()) == (
        403,
        {"detail": "User has no organisation"},
    )


def test_a_bank_no_organisation_of_theirs_serves_is_not_found(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _learner(db_session, trust)

    resp = _signed_in(test_client).get(DETAIL)

    assert resp.status_code == 404
    assert resp.json() == BANK_NOT_FOUND


def test_a_bank_another_organisation_serves_is_not_found(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """The same words as a bank nobody serves, so nothing is confirmed."""
    elsewhere = OrgUnit(name="Elsewhere", type="organisation")
    db_session.add(elsewhere)
    db_session.flush()
    _serve(db_session, elsewhere)
    _learner(db_session, trust)

    resp = _signed_in(test_client).get(DETAIL)

    assert resp.status_code == 404
    assert resp.json() == BANK_NOT_FOUND


def test_a_bank_they_are_no_longer_enrolled_on_is_not_found(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(db_session, trust)
    learner = _learner(db_session, trust)
    _end_enrolment(db_session, learner, trust)

    resp = _signed_in(test_client).get(DETAIL)

    assert resp.status_code == 404
    assert resp.json() == BANK_NOT_FOUND


def test_a_bank_with_no_version_promoted_is_not_found(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(db_session, trust, active_version=None)
    _learner(db_session, trust)

    resp = _signed_in(test_client).get(DETAIL)

    assert resp.status_code == 404
    assert resp.json() == BANK_NOT_FOUND


def test_a_promoted_version_that_was_never_synced_is_not_found(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(db_session, trust, synced=False)
    _learner(db_session, trust)

    resp = _signed_in(test_client).get(DETAIL)

    assert resp.status_code == 404
    assert resp.json() == BANK_NOT_FOUND


def test_a_bank_missing_some_of_its_media_is_not_found(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _serve(db_session, trust)
    _learner(db_session, trust)
    _media(monkeypatch, complete=False)

    resp = _signed_in(test_client).get(DETAIL)

    assert resp.status_code == 404
    assert resp.json() == BANK_NOT_FOUND


def test_a_bank_closed_to_new_attempts_is_described_with_its_whole_config(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """As the route stands: closed is said, and nothing is held back.

    Somebody enrolled on a bank that is closed to new attempts is still
    given its detail, ``config_yaml`` and all, where the learning pages
    of the same module are refused them. Pinned and not changed.
    """
    _serve(db_session, trust, is_live=False)
    _learner(db_session, trust)

    resp = _signed_in(test_client).get(DETAIL)

    assert resp.status_code == 200
    assert resp.json()["is_live"] is False
    assert resp.json()["config_yaml"] == CONFIG


# --- GET /question-banks ----------------------------------------------------


def test_a_bank_closed_to_new_attempts_is_listed_and_said_to_be_closed(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(db_session, trust, is_live=False)
    _learner(db_session, trust)

    resp = _signed_in(test_client).get(BANKS)

    assert resp.status_code == 200
    assert [
        (row["question_bank_id"], row["is_live"]) for row in resp.json()
    ] == [(BANK, False)]


@pytest.mark.parametrize(
    ("active_version", "synced"),
    [(None, True), (1, False)],
    ids=["no version promoted", "promoted version never synced"],
)
def test_a_bank_with_nothing_to_show_is_left_out_of_the_list(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    active_version: int | None,
    synced: bool,
) -> None:
    _serve(db_session, trust, active_version=active_version, synced=synced)
    _learner(db_session, trust)

    resp = _signed_in(test_client).get(BANKS)

    assert resp.status_code == 200
    assert resp.json() == []


def test_a_bank_missing_some_of_its_media_is_left_out_of_the_list(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _serve(db_session, trust)
    _learner(db_session, trust)
    _media(monkeypatch, complete=False)

    resp = _signed_in(test_client).get(BANKS)

    assert resp.status_code == 200
    assert resp.json() == []


def test_a_bank_they_are_no_longer_enrolled_on_is_left_out_of_the_list(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(db_session, trust)
    learner = _learner(db_session, trust)
    _end_enrolment(db_session, learner, trust)

    resp = _signed_in(test_client).get(BANKS)

    assert resp.status_code == 200
    assert resp.json() == []


# --- GET /modules/{module_id}/learning --------------------------------------


def test_the_pages_of_a_module_closed_to_new_attempts_are_not_found(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Refused before the content store is read at all."""
    _serve(db_session, trust, is_live=False)
    _learner(db_session, trust)
    read = _bucket(monkeypatch, "## One\n\nFirst.")

    resp = _signed_in(test_client).get(LEARNING)

    assert resp.status_code == 404
    assert resp.json() == MODULE_NOT_FOUND
    assert read == []


def test_the_pages_of_a_module_they_are_no_longer_enrolled_on_are_not_found(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _serve(db_session, trust)
    learner = _learner(db_session, trust)
    _end_enrolment(db_session, learner, trust)
    read = _bucket(monkeypatch, "## One\n\nFirst.")

    resp = _signed_in(test_client).get(LEARNING)

    assert resp.status_code == 404
    assert resp.json() == MODULE_NOT_FOUND
    assert read == []


def test_the_pages_of_a_module_missing_some_of_its_media_are_not_found(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _serve(db_session, trust)
    _learner(db_session, trust)
    _media(monkeypatch, complete=False)
    read = _bucket(monkeypatch, "## One\n\nFirst.")

    resp = _signed_in(test_client).get(LEARNING)

    assert resp.status_code == 404
    assert resp.json() == MODULE_NOT_FOUND
    assert read == []


def test_a_module_with_no_pages_in_the_bucket_has_no_learning_content(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _serve(db_session, trust)
    _learner(db_session, trust)
    _media(monkeypatch, complete=True)
    _bucket(monkeypatch, None)

    resp = _signed_in(test_client).get(LEARNING)

    assert resp.status_code == 404
    assert resp.json() == NO_LEARNING


def test_a_module_that_is_not_on_the_content_path_is_not_found(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _serve(db_session, trust)
    _learner(db_session, trust)
    _on_disk(monkeypatch, tmp_path, module=False)

    resp = _signed_in(test_client).get(LEARNING)

    assert resp.status_code == 404
    assert resp.json() == MODULE_NOT_FOUND


def test_a_module_on_disk_with_no_pages_has_no_learning_content(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _serve(db_session, trust)
    _learner(db_session, trust)
    _on_disk(monkeypatch, tmp_path)

    resp = _signed_in(test_client).get(LEARNING)

    assert resp.status_code == 404
    assert resp.json() == NO_LEARNING


def test_with_neither_a_bucket_nor_a_path_the_content_is_not_configured(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _serve(db_session, trust)
    _learner(db_session, trust)
    monkeypatch.setattr("app.config.settings.TEACHING_GCS_BUCKET", None)
    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", None
    )

    resp = _signed_in(test_client).get(LEARNING)

    assert resp.status_code == 404
    assert resp.json() == {"detail": "Teaching content not configured"}


def test_the_pages_of_a_live_module_are_given_slide_by_slide(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _serve(db_session, trust)
    _learner(db_session, trust)
    _on_disk(monkeypatch, tmp_path, slides="## One\n\nFirst.")

    resp = _signed_in(test_client).get(LEARNING)

    assert resp.status_code == 200
    assert resp.json()["module_id"] == BANK
    assert resp.json()["title"] == "On disk"
    assert [slide["title"] for slide in resp.json()["slides"]] == ["One"]


# --- Where the three routes do not ask the same question --------------------


def test_a_live_module_with_no_version_promoted_gives_its_pages_and_no_bank(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """As the routes stand: the learning pages do not ask for a version.

    The list and the detail hide a bank that has no version promoted,
    and the pages of the same module are given to somebody enrolled on
    it. The settings route promotes a version when it writes the row,
    so a row like this one is not expected. Pinned and not changed.
    """
    _serve(db_session, trust, active_version=None)
    _learner(db_session, trust)
    _media(monkeypatch, complete=True)
    _bucket(monkeypatch, "## One\n\nFirst.")
    client = _signed_in(test_client)

    assert client.get(BANKS).json() == []
    assert client.get(DETAIL).status_code == 404
    assert client.get(LEARNING).status_code == 200


def test_somebody_with_nowhere_to_take_modules_gets_three_different_answers(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An empty list, a 403 and a 404, for the one state. Pinned as it is.

    The 403 says only that they have no organisation, which is true of
    every bank id they could send, so it confirms nothing about this one.
    """
    _serve(db_session, trust)
    member = _delegate(db_session)
    add_org_unit_member(db_session, trust.id, member.id, "trainee")
    db_session.commit()
    read = _bucket(monkeypatch, "## One\n\nFirst.")
    client = _signed_in(test_client)

    listed = client.get(BANKS)
    detail = client.get(DETAIL)
    pages = client.get(LEARNING)

    assert (listed.status_code, listed.json()) == (200, [])
    assert (detail.status_code, detail.json()) == (
        403,
        {"detail": "User has no organisation"},
    )
    assert (pages.status_code, pages.json()) == (404, MODULE_NOT_FOUND)
    assert read == []
