"""What an administrator is answered when they sync banks by hand.

``POST /admin/sync-all``, ``POST /items/validate`` and
``POST /items/sync``. The rules are tested on their own in
``app/features/teaching/manual_sync_test.py``; this drives the routes,
to pin the status and the words a caller is sent. No test drove these
three routes before their rules were moved out of the router.

The banks are a tree on the filesystem, where the real validator and
the real sync run over it, as in ``ci_sync_test.py``.

Three things are pinned here as they stand, each saying so:

- **A bank that did not load is listed as synced** by the sync of every
  bank. The deploy pipeline's sync lists it as failed.
- **Syncing one live bank whose version has not moved on answers 500.**
- **The bank is looked for before the caller's membership is asked.**
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.features.teaching.models import (
    QuestionBankConfig,
    QuestionBankSync,
)
from app.models import OrgUnit, OrgUnitFeature, User
from app.organisations import add_org_unit_member
from app.security import hash_password

SYNC_ALL = "/api/teaching/admin/sync-all"
VALIDATE = "/api/teaching/items/validate"
SYNC_ONE = "/api/teaching/items/sync"

PASSWORD = "Educator123!"  # noqa: S105

_VALID_MODULE = (
    Path(__file__).resolve().parent
    / "fixtures"
    / "teaching_tooling"
    / ".valid-module"
)
#: The fixture's declared moduleId, which its directory name must match.
GOOD = "valid-module"

#: A module that passes its own checks and whose assessment does not.
BAD_ASSESSMENT = "bad-assessment"

#: A directory that is not a module at all.
BAD_MODULE = "bad-bank"

BANK_ID_REQUIRED = {"detail": "bank_id is required"}
NOT_A_MEMBER = {"detail": "User is not a member of any organisation"}
NOWHERE_TO_READ = {
    "detail": (
        "Neither TEACHING_QUESTION_BANK_PATH nor "
        "TEACHING_GCS_BUCKET is configured"
    )
}


def _banks_on_disk(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    *,
    good: bool = False,
    bad_assessment: bool = False,
    bad_module: bool = False,
) -> None:
    """Build a modules-layout tree and have the deployment read it."""
    modules = tmp_path / "repo" / "modules"
    modules.mkdir(parents=True)

    if good:
        shutil.copytree(_VALID_MODULE, modules / GOOD)

    if bad_assessment:
        module = modules / BAD_ASSESSMENT
        shutil.copytree(_VALID_MODULE, module)
        metadata = module / "module.yaml"
        metadata.write_text(metadata.read_text().replace(GOOD, BAD_ASSESSMENT))
        # The module still passes. Only the assessment is at fault, so
        # the sync gets as far as recording that it failed.
        assessment = module / "assessment" / "assessment.yaml"
        assessment.write_text(
            "\n".join(
                line
                for line in assessment.read_text().splitlines()
                if not line.startswith(("options:", "- "))
            )
            + "\n"
        )

    if bad_module:
        broken = modules / BAD_MODULE
        broken.mkdir()
        # Parses as YAML, but is not a module: validation rejects it.
        (broken / "module.yaml").write_text(f"moduleId: {BAD_MODULE}\n")
        (broken / "assessment").mkdir()
        (broken / "assessment" / "config.yaml").write_text("{}\n")

    monkeypatch.setattr(settings, "TEACHING_GCS_BUCKET", None)
    monkeypatch.setattr(settings, "TEACHING_QUESTION_BANK_PATH", str(tmp_path))


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    org = OrgUnit(name="Syncing Trust", type="organisation")
    db_session.add(org)
    db_session.flush()
    db_session.add(
        OrgUnitFeature(
            org_unit_id=org.id, feature_key="teaching", enabled_by=1
        )
    )
    db_session.commit()
    db_session.refresh(org)

    return org


def _teaching_admin(db: Session, username: str) -> User:
    """Holds ``manage_teaching``, and belongs nowhere yet."""
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession="teaching_admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return user


@pytest.fixture
def admin(db_session: Session, trust: OrgUnit) -> User:
    user = _teaching_admin(db_session, "coordinator")
    add_org_unit_member(db_session, trust.id, user.id, "staff")
    db_session.commit()

    return user


@pytest.fixture
def outsider(db_session: Session, trust: OrgUnit) -> User:
    """A teaching admin at a ward of the trust, and no organisation."""
    user = _teaching_admin(db_session, "ward_coordinator")
    ward = OrgUnit(name="Ward 9", type="ward", parent_id=trust.id)
    db_session.add(ward)
    db_session.flush()
    add_org_unit_member(db_session, ward.id, user.id, "staff")
    db_session.commit()

    return user


def _login(client: TestClient, user: User) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"username": user.username, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text

    return {"X-CSRF-Token": client.cookies.get("XSRF-TOKEN", "")}


# --- POST /admin/sync-all ---------------------------------------------------


def test_a_good_bank_is_synced_into_the_callers_organisation(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _banks_on_disk(tmp_path, monkeypatch, good=True)

    response = test_client.post(SYNC_ALL, headers=_login(test_client, admin))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["errors"] == []
    assert [
        (row["question_bank_id"], row["version"], row["status"])
        for row in body["synced"]
    ] == [(GOOD, 1, "success")]
    assert body["synced"][0]["items_created"] == 1

    config = db_session.execute(select(QuestionBankConfig)).scalar_one()

    assert config.org_unit_id == trust.id
    assert config.synced_by == admin.id


def test_a_bank_that_did_not_load_is_listed_as_synced(
    test_client: TestClient,
    db_session: Session,
    admin: User,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A known fault, recorded in the plan for a decision, and pinned
    here as it stands.

    The assessment failed its checks, so nothing of the bank was
    loaded. A record is kept of that, and the sync of every bank takes
    any record for a sync: the bank is under ``synced``, ``errors`` is
    empty and the answer is 200. The record does say ``failed`` and
    carry what the checks found, but the list it is in says synced, and
    the admin page shows the bank as imported. The deploy pipeline's
    sync, ``sync_every_bank``, lists the same bank as failed. See
    ``docs/docs/plans/2026-10-11-thin-routes-and-steady-frontend-tests-plan.md``.
    """
    _banks_on_disk(tmp_path, monkeypatch, bad_assessment=True)

    response = test_client.post(SYNC_ALL, headers=_login(test_client, admin))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["errors"] == []
    assert len(body["synced"]) == 1

    listed = body["synced"][0]

    assert listed["question_bank_id"] == BAD_ASSESSMENT
    assert listed["status"] == "failed"
    assert listed["items_created"] == 0
    assert [fault["message"] for fault in listed["errors"]] == [
        "uniform type requires 'options'"
    ]
    # Nothing of it was loaded.
    assert db_session.scalar(select(QuestionBankConfig)) is None


def test_a_module_that_fails_its_checks_is_listed_and_the_good_one_synced(
    test_client: TestClient,
    admin: User,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _banks_on_disk(tmp_path, monkeypatch, good=True, bad_module=True)

    response = test_client.post(SYNC_ALL, headers=_login(test_client, admin))

    assert response.status_code == 200, response.text
    body = response.json()
    assert [row["question_bank_id"] for row in body["synced"]] == [GOOD]
    assert [row["bank_id"] for row in body["errors"]] == [BAD_MODULE]
    assert body["errors"][0]["error"]


def test_a_live_bank_synced_again_unchanged_is_on_neither_list(
    test_client: TestClient,
    admin: User,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _banks_on_disk(tmp_path, monkeypatch, good=True)
    headers = _login(test_client, admin)
    test_client.post(SYNC_ALL, headers=headers)

    response = test_client.post(SYNC_ALL, headers=headers)

    assert response.status_code == 200, response.text
    assert response.json() == {"synced": [], "errors": []}


def test_with_no_banks_to_read_both_lists_are_empty(
    test_client: TestClient,
    admin: User,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _banks_on_disk(tmp_path, monkeypatch)

    response = test_client.post(SYNC_ALL, headers=_login(test_client, admin))

    assert response.status_code == 200, response.text
    assert response.json() == {"synced": [], "errors": []}


def test_syncing_every_bank_is_refused_to_a_member_of_no_organisation(
    test_client: TestClient,
    db_session: Session,
    outsider: User,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _banks_on_disk(tmp_path, monkeypatch, good=True)

    response = test_client.post(
        SYNC_ALL, headers=_login(test_client, outsider)
    )

    assert response.status_code == 403
    assert response.json() == NOT_A_MEMBER
    assert db_session.scalar(select(QuestionBankSync)) is None


# --- POST /items/validate ---------------------------------------------------


def test_checking_a_bank_needs_it_named(
    test_client: TestClient, admin: User
) -> None:
    headers = _login(test_client, admin)

    for body in ({}, {"bank_id": ""}):
        response = test_client.post(VALIDATE, json=body, headers=headers)

        assert response.status_code == 400
        assert response.json() == BANK_ID_REQUIRED


def test_checking_a_good_bank_says_it_is_valid_and_loads_nothing(
    test_client: TestClient,
    db_session: Session,
    admin: User,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _banks_on_disk(tmp_path, monkeypatch, good=True)

    response = test_client.post(
        VALIDATE,
        json={"bank_id": GOOD},
        headers=_login(test_client, admin),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["is_valid"] is True
    assert body["errors"] == []
    assert body["version"] == 1
    assert body["item_count"] == 1
    assert body["summary"]
    assert db_session.scalar(select(QuestionBankSync)) is None
    assert db_session.scalar(select(QuestionBankConfig)) is None


def test_checking_a_bank_whose_assessment_is_at_fault_says_what_is_wrong(
    test_client: TestClient,
    db_session: Session,
    admin: User,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _banks_on_disk(tmp_path, monkeypatch, bad_assessment=True)

    response = test_client.post(
        VALIDATE,
        json={"bank_id": BAD_ASSESSMENT},
        headers=_login(test_client, admin),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["is_valid"] is False
    assert [fault["message"] for fault in body["errors"]] == [
        "uniform type requires 'options'"
    ]
    assert db_session.scalar(select(QuestionBankSync)) is None


def test_checking_a_bank_is_refused_to_a_member_of_no_organisation(
    test_client: TestClient,
    outsider: User,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _banks_on_disk(tmp_path, monkeypatch, good=True)

    response = test_client.post(
        VALIDATE,
        json={"bank_id": GOOD},
        headers=_login(test_client, outsider),
    )

    assert response.status_code == 403
    assert response.json() == NOT_A_MEMBER


def test_the_bank_is_looked_for_before_membership_is_asked(
    test_client: TestClient,
    outsider: User,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pinned as it stands. Both are wrong here, and it is the bank that
    is reported: somebody who may not sync anything is told a bank could
    not be found before they are told they may not. The words are the
    ones for nowhere to read from, since no bucket is set to look in.
    """
    _banks_on_disk(tmp_path, monkeypatch)
    headers = _login(test_client, outsider)

    for path in (VALIDATE, SYNC_ONE):
        response = test_client.post(
            path, json={"bank_id": "no-such-bank"}, headers=headers
        )

        assert response.status_code == 400
        assert response.json() == NOWHERE_TO_READ


def test_a_bank_id_that_reaches_outside_the_content_is_refused(
    test_client: TestClient, admin: User
) -> None:
    headers = _login(test_client, admin)

    for path in (VALIDATE, SYNC_ONE):
        response = test_client.post(
            path, json={"bank_id": "../elsewhere"}, headers=headers
        )

        assert response.status_code == 400
        assert response.json() == {"detail": "Invalid bank_id"}


# --- POST /items/sync -------------------------------------------------------


def test_syncing_a_bank_needs_it_named(
    test_client: TestClient, admin: User
) -> None:
    headers = _login(test_client, admin)

    for body in ({}, {"bank_id": ""}):
        response = test_client.post(SYNC_ONE, json=body, headers=headers)

        assert response.status_code == 400
        assert response.json() == BANK_ID_REQUIRED


def test_syncing_a_good_bank_answers_with_its_record(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _banks_on_disk(tmp_path, monkeypatch, good=True)

    response = test_client.post(
        SYNC_ONE, json={"bank_id": GOOD}, headers=_login(test_client, admin)
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["question_bank_id"] == GOOD
    assert body["version"] == 1
    assert body["status"] == "success"
    assert body["items_created"] == 1
    assert body["errors"] == []

    record = db_session.execute(select(QuestionBankSync)).scalar_one()

    assert record.id == body["id"]
    assert record.org_unit_id == trust.id
    assert record.triggered_by == admin.id


def test_syncing_a_bank_whose_assessment_is_at_fault_answers_its_failed_record(
    test_client: TestClient,
    db_session: Session,
    admin: User,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A 200 whose record says ``failed``, with what the checks found."""
    _banks_on_disk(tmp_path, monkeypatch, bad_assessment=True)

    response = test_client.post(
        SYNC_ONE,
        json={"bank_id": BAD_ASSESSMENT},
        headers=_login(test_client, admin),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "failed"
    assert [fault["message"] for fault in body["errors"]] == [
        "uniform type requires 'options'"
    ]
    assert db_session.scalar(select(QuestionBankConfig)) is None


def test_syncing_a_live_bank_again_unchanged_answers_500(
    test_client: TestClient,
    admin: User,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pinned as it stands, and not what anybody would choose.

    A live bank whose version has not moved on has nothing new to load,
    so the sync makes no record, and this route takes no record for a
    failure. The sync of every bank leaves the same bank off both its
    lists and answers 200.
    """
    _banks_on_disk(tmp_path, monkeypatch, good=True)
    headers = _login(test_client, admin)
    first = test_client.post(SYNC_ONE, json={"bank_id": GOOD}, headers=headers)
    assert first.status_code == 200, first.text

    response = test_client.post(
        SYNC_ONE, json={"bank_id": GOOD}, headers=headers
    )

    assert response.status_code == 500
    assert response.json() == {"detail": "Sync failed unexpectedly"}


def test_syncing_a_bank_is_refused_to_a_member_of_no_organisation(
    test_client: TestClient,
    db_session: Session,
    outsider: User,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _banks_on_disk(tmp_path, monkeypatch, good=True)

    response = test_client.post(
        SYNC_ONE,
        json={"bank_id": GOOD},
        headers=_login(test_client, outsider),
    )

    assert response.status_code == 403
    assert response.json() == NOT_A_MEMBER
    assert db_session.scalar(select(QuestionBankSync)) is None
