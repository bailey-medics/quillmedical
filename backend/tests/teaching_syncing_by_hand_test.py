"""What an administrator is answered when they sync banks by hand.

``POST /admin/sync-all``, ``POST /items/validate`` and
``POST /items/sync``. The rules are tested on their own in
``app/features/teaching/manual_sync_test.py``; this drives the routes,
to pin the status and the words a caller is sent. No test drove these
three routes before their rules were moved out of the router.

The banks are a tree on the filesystem, where the real validator and
the real sync run over it, as in ``ci_sync_test.py``.

Two faults were pinned here as they stood, and were then put right. The
tests that pinned them now pin the rule:

- **A bank that did not load is listed as failed** by the sync of every
  bank, with what the checks said, as the deploy pipeline's sync lists
  it. It was once listed as synced. A draft turned away for its version
  is listed as failed too, where it was on neither list.
- **Syncing one live bank whose version has not moved on answers that
  there was nothing to do.** It once answered 500.

One thing is still pinned as it stands, saying so:

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

#: A draft whose version is 2, which the sync turns away.
DRAFT_AT_2 = "draft-at-two"

BAD_ASSESSMENT_FAULT = "uniform type requires 'options'"
DRAFT_AT_2_FAULT = "Draft module version must be 1, got 2"

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
    draft_at_2: bool = False,
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

    if draft_at_2:
        module = modules / DRAFT_AT_2
        shutil.copytree(_VALID_MODULE, module)
        metadata = module / "module.yaml"
        metadata.write_text(
            metadata.read_text()
            .replace(GOOD, DRAFT_AT_2)
            .replace("status: live", "status: draft")
        )
        # Nothing is wrong with the content. A draft is turned away for
        # its version alone, and the sync makes no record of it.
        assessment = module / "assessment" / "assessment.yaml"
        assessment.write_text(
            assessment.read_text().replace("version: 1", "version: 2")
        )

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


def test_a_bank_that_did_not_load_is_listed_as_failed(
    test_client: TestClient,
    db_session: Session,
    admin: User,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The assessment failed its checks, so nothing of the bank was
    loaded. A record is kept of that, and the sync of every bank once
    took any record for a sync: the bank was under ``synced`` and the
    admin page showed it as imported. It is under ``errors`` with what
    the checks said, and not under ``synced``, as the deploy pipeline's
    ``sync_every_bank`` lists it.

    The answer is still a 200, where the pipeline's is a 422: the page
    reads the two lists to show what became of each bank. See
    ``docs/docs/plans/2026-10-11-thin-routes-and-steady-frontend-tests-plan.md``.
    """
    _banks_on_disk(tmp_path, monkeypatch, bad_assessment=True)

    response = test_client.post(SYNC_ALL, headers=_login(test_client, admin))

    assert response.status_code == 200, response.text
    assert response.json() == {
        "synced": [],
        "errors": [{"bank_id": BAD_ASSESSMENT, "error": BAD_ASSESSMENT_FAULT}],
    }
    # Nothing of it was loaded, and the record of the failure is kept.
    assert db_session.scalar(select(QuestionBankConfig)) is None
    assert db_session.execute(
        select(QuestionBankSync)
    ).scalar_one().status == ("failed")


def test_a_good_bank_and_one_that_did_not_load_are_each_listed(
    test_client: TestClient,
    admin: User,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _banks_on_disk(tmp_path, monkeypatch, good=True, bad_assessment=True)

    response = test_client.post(SYNC_ALL, headers=_login(test_client, admin))

    assert response.status_code == 200, response.text
    body = response.json()
    assert [
        (row["question_bank_id"], row["status"], row["unchanged"])
        for row in body["synced"]
    ] == [(GOOD, "success", False)]
    assert body["errors"] == [
        {"bank_id": BAD_ASSESSMENT, "error": BAD_ASSESSMENT_FAULT}
    ]


def test_a_draft_turned_away_for_its_version_is_listed_as_failed(
    test_client: TestClient,
    db_session: Session,
    admin: User,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The sync makes no record of it, which once left it off both
    lists with nothing said.
    """
    _banks_on_disk(tmp_path, monkeypatch, draft_at_2=True)

    response = test_client.post(SYNC_ALL, headers=_login(test_client, admin))

    assert response.status_code == 200, response.text
    assert response.json() == {
        "synced": [],
        "errors": [{"bank_id": DRAFT_AT_2, "error": DRAFT_AT_2_FAULT}],
    }
    assert db_session.scalar(select(QuestionBankSync)) is None
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


def test_syncing_a_live_bank_again_unchanged_answers_nothing_to_do(
    test_client: TestClient,
    db_session: Session,
    admin: User,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A live bank whose version has not moved on has nothing new to
    load, so the sync makes no record. That once answered 500 "Sync
    failed unexpectedly", though nothing was wrong. It answers 200 with
    the record of the sync that loaded what is being served, marked
    ``unchanged``, and makes no second record.
    """
    _banks_on_disk(tmp_path, monkeypatch, good=True)
    headers = _login(test_client, admin)
    first = test_client.post(SYNC_ONE, json={"bank_id": GOOD}, headers=headers)
    assert first.status_code == 200, first.text
    assert first.json()["unchanged"] is False

    response = test_client.post(
        SYNC_ONE, json={"bank_id": GOOD}, headers=headers
    )

    assert response.status_code == 200, response.text
    assert response.json() == {**first.json(), "unchanged": True}
    assert len(db_session.scalars(select(QuestionBankSync)).all()) == 1


def test_syncing_a_draft_turned_away_for_its_version_is_refused_with_why(
    test_client: TestClient,
    db_session: Session,
    admin: User,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No record is made of it either, but it is not "nothing to do":
    the checks found fault, so it is a failure and says why. It once
    answered 500 "Sync failed unexpectedly".
    """
    _banks_on_disk(tmp_path, monkeypatch, draft_at_2=True)

    response = test_client.post(
        SYNC_ONE,
        json={"bank_id": DRAFT_AT_2},
        headers=_login(test_client, admin),
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": f"The bank was not synced: {DRAFT_AT_2_FAULT}"
    }
    assert db_session.scalar(select(QuestionBankSync)) is None
    assert db_session.scalar(select(QuestionBankConfig)) is None


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
