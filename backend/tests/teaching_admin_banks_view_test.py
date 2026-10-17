"""What an administrator is shown of the banks, through the three routes.

``GET /admin/banks``, ``GET /admin/banks/{bank_id}`` and
``GET /admin/banks/{bank_id}/organisations``. The rules are tested on
their own in ``app/features/teaching/access_test.py``,
``listing_test.py`` and ``admin_banks_test.py``; this says what a caller
is told, and pins where the three routes do not draw the same line
around what an administrator may see.

- **Synced copies are their own organisation's.** The list and the
  detail read only what was synced into the organisation the caller
  belongs to.
- **The bucket is not anybody's.** The list names every bank in the
  bucket, by id, whichever organisation it was written for.
- **The organisations are everybody's.** The list of organisations for
  a bank names every organisation with teaching switched on, and says
  how the bank stands at each, whether or not the caller belongs there.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import settings
from app.features.teaching.models import (
    QuestionBankConfig,
    QuestionBankItem,
    QuestionBankOrgStatus,
)
from app.models import OrgUnit, OrgUnitFeature, User
from app.organisations import add_org_unit_member
from app.security import hash_password

BANKS = "/api/teaching/admin/banks"
BANK = "polyps"
THEIR_BANK = "bleeding"

PASSWORD = "Educator123!"  # noqa: S105

BANK_NOT_FOUND = {"detail": "Question bank not found"}
NOT_A_MEMBER = {"detail": "User is not a member of any organisation"}


def _teaching_org(db: Session, name: str) -> OrgUnit:
    org = OrgUnit(name=name, type="organisation")
    db.add(org)
    db.flush()
    db.add(
        OrgUnitFeature(
            org_unit_id=org.id, feature_key="teaching", enabled_by=1
        )
    )
    db.commit()
    db.refresh(org)

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


def _synced(
    db: Session,
    org: OrgUnit,
    bank_id: str,
    *,
    version: int = 1,
    items: int = 0,
    title: str | None = None,
) -> None:
    """One version of a bank synced into an organisation, with items."""
    db.add(
        QuestionBankConfig(
            org_unit_id=org.id,
            question_bank_id=bank_id,
            version=version,
            title=title or f"{bank_id} v{version}",
            description="",
            type="uniform",
            config_yaml={},
        )
    )

    for _ in range(items):
        db.add(
            QuestionBankItem(
                org_unit_id=org.id,
                question_bank_id=bank_id,
                bank_version=version,
                status="published",
                images=[],
                metadata_json={},
            )
        )

    db.commit()


def _served(
    db: Session,
    org: OrgUnit,
    bank_id: str,
    *,
    active_version: int | None = 1,
    is_live: bool = True,
    site_registration: bool = False,
) -> None:
    db.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=bank_id,
            is_live=is_live,
            active_version=active_version,
            site_registration=site_registration,
        )
    )
    db.commit()


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    return _teaching_org(db_session, "Our Trust")


@pytest.fixture
def other_trust(db_session: Session) -> OrgUnit:
    """An organisation the caller does not belong to."""
    return _teaching_org(db_session, "Another Trust")


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


def _login(client: TestClient, user: User) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": user.username, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text


def _no_bucket(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "TEACHING_GCS_BUCKET", None)


def _bucket_holding(monkeypatch: pytest.MonkeyPatch, *bank_ids: str) -> None:
    monkeypatch.setattr(settings, "TEACHING_GCS_BUCKET", "a-bucket")
    monkeypatch.setattr(
        "app.features.teaching.storage.list_banks_in_gcs",
        lambda bucket: list(bank_ids),
    )


# --- GET /admin/banks -------------------------------------------------------


def test_the_list_gives_the_newest_synced_version_and_the_one_served(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _no_bucket(monkeypatch)
    _synced(db_session, trust, BANK, version=1, items=3)
    _synced(db_session, trust, BANK, version=2, items=2, title="Polyps")
    _served(db_session, trust, BANK, active_version=1)
    _login(test_client, admin)

    response = test_client.get(BANKS)

    assert response.status_code == 200, response.text
    assert len(response.json()) == 1

    row = response.json()[0]

    assert row["bank_id"] == BANK
    assert row["title"] == "Polyps"
    assert row["version"] == 2
    assert row["active_version"] == 1
    assert row["type"] == "uniform"
    # The items of the newest version, not of every version.
    assert row["item_count"] == 2
    assert row["in_db"] is True
    assert row["in_gcs"] is False


def test_a_bank_synced_into_another_organisation_is_not_listed(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    other_trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _no_bucket(monkeypatch)
    _synced(db_session, trust, BANK)
    _synced(db_session, other_trust, THEIR_BANK, items=4)
    _served(db_session, other_trust, THEIR_BANK)
    _login(test_client, admin)

    response = test_client.get(BANKS)

    assert response.status_code == 200, response.text
    assert [row["bank_id"] for row in response.json()] == [BANK]


def test_every_bank_in_the_bucket_is_named_whoever_it_is_for(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    other_trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pinned as it stands: the bucket is listed whole.

    A bank the caller's organisation has never synced, and that another
    organisation holds, is still named here by its id, because it is in
    the bucket. Nothing of the other organisation's copy is given: no
    title, no version, no count of items. It is the id alone, and it is
    what lets an administrator see there is something to sync.
    """
    _synced(db_session, trust, BANK)
    _synced(db_session, other_trust, THEIR_BANK, items=4)
    _served(db_session, other_trust, THEIR_BANK)
    _bucket_holding(monkeypatch, THEIR_BANK, BANK)
    _login(test_client, admin)

    response = test_client.get(BANKS)

    assert response.status_code == 200, response.text
    rows = {row["bank_id"]: row for row in response.json()}

    # In bank id order.
    assert list(rows) == [THEIR_BANK, BANK]
    assert rows[BANK]["in_gcs"] is True
    assert rows[BANK]["in_db"] is True
    assert rows[THEIR_BANK] == {
        "bank_id": THEIR_BANK,
        "title": None,
        "version": None,
        "active_version": None,
        "type": None,
        "synced_at": None,
        "in_gcs": True,
        "in_db": False,
        "item_count": 0,
    }


def test_a_bucket_that_cannot_be_listed_leaves_the_synced_banks_listed(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def refuse(bucket: str) -> list[str]:
        raise RuntimeError("no credentials")

    _synced(db_session, trust, BANK)
    monkeypatch.setattr(settings, "TEACHING_GCS_BUCKET", "a-bucket")
    monkeypatch.setattr(
        "app.features.teaching.storage.list_banks_in_gcs", refuse
    )
    _login(test_client, admin)

    response = test_client.get(BANKS)

    assert response.status_code == 200, response.text
    assert [(row["bank_id"], row["in_gcs"]) for row in response.json()] == [
        (BANK, False)
    ]


# --- GET /admin/banks/{bank_id} ---------------------------------------------


def test_the_detail_of_a_bank_never_synced_is_not_found(
    test_client: TestClient, admin: User
) -> None:
    _login(test_client, admin)

    response = test_client.get(f"{BANKS}/{BANK}")

    assert response.status_code == 404
    assert response.json() == BANK_NOT_FOUND


def test_the_detail_of_a_bank_only_another_organisation_holds_is_not_found(
    test_client: TestClient,
    db_session: Session,
    other_trust: OrgUnit,
    admin: User,
) -> None:
    """The same words as a bank that was never synced anywhere."""
    _synced(db_session, other_trust, THEIR_BANK, items=4)
    _served(db_session, other_trust, THEIR_BANK)
    _login(test_client, admin)

    response = test_client.get(f"{BANKS}/{THEIR_BANK}")

    assert response.status_code == 404
    assert response.json() == BANK_NOT_FOUND


def test_the_detail_counts_the_items_of_every_version(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    other_trust: OrgUnit,
    admin: User,
) -> None:
    """Pinned as it stands: the list counts the newest version's items
    and the detail counts every version's, so the two can disagree about
    one bank. Another organisation's items are counted by neither.
    """
    _synced(db_session, trust, BANK, version=1, items=3)
    _synced(db_session, trust, BANK, version=2, items=2)
    _synced(db_session, other_trust, BANK, version=5, items=7)
    _served(db_session, trust, BANK, active_version=1)
    _served(db_session, other_trust, BANK, active_version=5)
    _login(test_client, admin)

    response = test_client.get(f"{BANKS}/{BANK}")

    assert response.status_code == 200, response.text
    assert response.json() == {
        "bank_id": BANK,
        "title": f"{BANK} v2",
        "version": 2,
        "active_version": 1,
        "type": "uniform",
        "item_count": 5,
        "email_student_on_pass": False,
        "email_coordinator_on_pass": False,
        "coordinator_email_template": None,
        "student_email_template": None,
    }


def test_the_detail_is_refused_to_a_member_of_no_organisation(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    outsider: User,
) -> None:
    _synced(db_session, trust, BANK)
    _login(test_client, outsider)

    response = test_client.get(f"{BANKS}/{BANK}")

    assert response.status_code == 403
    assert response.json() == NOT_A_MEMBER


# --- GET /admin/banks/{bank_id}/organisations -------------------------------


def test_every_teaching_organisation_is_listed_with_how_the_bank_stands(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    other_trust: OrgUnit,
    admin: User,
) -> None:
    """Pinned as it stands: the list is not narrowed to the caller's own.

    An administrator at one organisation is given the name of every
    organisation with teaching switched on, and whether this bank is
    open to new attempts and to site registration at each. They belong
    to one of the two here. Saving a change for the other is refused
    by the settings route, so this shows a row they cannot act on.
    """
    _served(
        db_session,
        other_trust,
        BANK,
        is_live=True,
        site_registration=True,
    )
    _login(test_client, admin)

    response = test_client.get(f"{BANKS}/{BANK}/organisations")

    assert response.status_code == 200, response.text
    # In name order.
    assert response.json() == [
        {
            "org_unit_id": other_trust.id,
            "organisation_name": "Another Trust",
            "is_live": True,
            "site_registration": True,
            # Not theirs to upload for.
            "may_upload_videos": False,
        },
        {
            "org_unit_id": trust.id,
            "organisation_name": "Our Trust",
            "is_live": False,
            "site_registration": False,
            # Theirs, but it does not hold the bank.
            "may_upload_videos": False,
        },
    ]


def test_the_organisations_are_listed_for_a_bank_nobody_has(
    test_client: TestClient, trust: OrgUnit, admin: User
) -> None:
    """The bank id is not looked up: any id lists every organisation."""
    _login(test_client, admin)

    response = test_client.get(f"{BANKS}/no-such-bank/organisations")

    assert response.status_code == 200, response.text
    assert [row["organisation_name"] for row in response.json()] == [
        "Our Trust"
    ]


def test_the_organisations_are_refused_to_a_member_of_no_organisation(
    test_client: TestClient, trust: OrgUnit, outsider: User
) -> None:
    _login(test_client, outsider)

    response = test_client.get(f"{BANKS}/{BANK}/organisations")

    assert response.status_code == 403
    assert response.json() == NOT_A_MEMBER
