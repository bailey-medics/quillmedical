"""Learning slides are readable only where they have been delivered.

`GET /api/teaching/modules/{module_id}/learning` was guarded by two things
and neither was enough: the router's `requires_feature("teaching")`, which
asks about the *caller's* organisation, and a signed-in user. There was no
competency check and no organisation scoping at all, so anyone at any
organisation with teaching enabled could fetch any module's slides by
naming its id. `_SAFE_BANK_ID` restricted the characters allowed in that
id, not who owned the material.

**Visibility is delivery, not authorship.** A bank may be written by an
educator organisation and read by several others, so the question is not
who owns it but who has been given it: `QuestionBankOrgStatus` with a
promoted `active_version`. `list_modules` already decides visibility that
way, and this now matches it rather than inventing a second rule.

**404, not 403**, matching the site and organisation checks, so a response
does not confirm that a module exists to someone who may not read it.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.features.teaching.models import (
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.models import (
    Organisation,
    OrganisationFeature,
    User,
    organisation_member,
)
from app.security import hash_password

BANK_ID = "delivered-bank"
SAMPLE_CONFIG: dict[str, object] = {"title": "Bank"}


def _org_with_teaching(db: Session, name: str) -> Organisation:
    """An organisation with the teaching feature switched on."""
    org = Organisation(name=name, type="hospital")
    db.add(org)
    db.commit()
    # A row's presence is what enables the feature; there is no flag.
    db.add(OrganisationFeature(organisation_id=org.id, feature_key="teaching"))
    db.commit()
    db.refresh(org)
    return org


def _member(
    db: Session,
    username: str,
    org: Organisation,
    profession: str = "teaching_delegate",
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        system_permissions="staff",
    )
    db.add(user)
    db.flush()
    db.execute(
        insert(organisation_member).values(
            organisation_id=org.id, user_id=user.id, capacity="trainee"
        )
    )
    db.commit()
    db.refresh(user)
    return user


def _deliver_bank(
    db: Session, org: Organisation, *, active_version: int | None = 1
) -> None:
    """Give an organisation a bank, optionally without promoting it."""
    db.add(
        QuestionBankConfig(
            organisation_id=org.id,
            question_bank_id=BANK_ID,
            version=1,
            title="Bank",
            description="A bank.",
            type="uniform",
            config_yaml=SAMPLE_CONFIG,
        )
    )
    db.add(
        QuestionBankOrgStatus(
            organisation_id=org.id,
            question_bank_id=BANK_ID,
            is_live=True,
            active_version=active_version,
        )
    )
    db.commit()


def _login(client: TestClient, username: str) -> None:
    resp = client.post(
        "/api/auth/login",
        json={"username": username, "password": "Password123!"},
    )
    assert resp.status_code == 200


def _read(client: TestClient) -> Response:
    return client.get(f"/api/teaching/modules/{BANK_ID}/learning")


class TestAnotherOrganisationsMaterialIsNotReadable:
    """The leak: no id was needed beyond the module's own name."""

    def test_a_bank_delivered_elsewhere_is_not_readable(
        self, test_client: TestClient, db_session: Session
    ):
        theirs = _org_with_teaching(db_session, "Educator Trust")
        mine = _org_with_teaching(db_session, "My Trust")
        _deliver_bank(db_session, theirs)
        _member(db_session, "outsider", mine)

        _login(test_client, "outsider")
        resp = _read(test_client)

        assert resp.status_code == 404
        # The scoping refused it, not the content loader.
        assert resp.json()["detail"] == "Module not available"

    def test_a_bank_that_does_not_exist_is_not_readable(
        self, test_client: TestClient, db_session: Session
    ):
        mine = _org_with_teaching(db_session, "My Trust")
        _member(db_session, "reader", mine)

        _login(test_client, "reader")

        assert _read(test_client).status_code == 404


class TestDeliveredMaterialPassesTheScopingCheck:
    """A check that refused everything would pass the tests above."""

    def test_a_delivered_bank_passes_the_organisation_check(
        self, test_client: TestClient, db_session: Session
    ):
        """Past the scoping, so the outcome is about content, not access.

        The scoping refusal says "Module not available" and the
        content loader says "Module not found", so the two are told
        apart by message rather than by status. Both are 404 on
        purpose — a reader must not learn from the status code whether
        a module exists.
        """
        mine = _org_with_teaching(db_session, "My Trust")
        _deliver_bank(db_session, mine)
        _member(db_session, "reader", mine)

        _login(test_client, "reader")
        resp = _read(test_client)

        assert resp.status_code == 404
        assert resp.json()["detail"] == "Module not found"


class TestABankNotYetPromotedIsNotDelivered:
    """Imported is not the same as put in front of anyone."""

    def test_a_bank_with_no_active_version_is_not_readable(
        self, test_client: TestClient, db_session: Session
    ):
        """`list_modules` skips these too, for the same reason."""
        mine = _org_with_teaching(db_session, "My Trust")
        _deliver_bank(db_session, mine, active_version=None)
        _member(db_session, "reader", mine)

        _login(test_client, "reader")
        resp = _read(test_client)

        assert resp.status_code == 404
        assert resp.json()["detail"] == "Module not available"


class TestTheCompetencyIsRequired:
    """`view_teaching_cases` existed and no route asked for it."""

    def test_a_profession_without_the_competency_is_refused(
        self, test_client: TestClient, db_session: Session
    ):
        """A consultant is not a teaching reader by default.

        Only teaching_delegate, teaching_clinical_lead and teaching_admin
        grant `view_teaching_cases`, so an ordinary clinician needs it
        granted explicitly. That is a deliberate narrowing.
        """
        mine = _org_with_teaching(db_session, "My Trust")
        _deliver_bank(db_session, mine)
        _member(db_session, "consultant", mine, profession="consultant")

        _login(test_client, "consultant")

        assert _read(test_client).status_code == 403

    def test_the_competency_can_be_granted_to_anyone(
        self, test_client: TestClient, db_session: Session
    ):
        """The escape hatch: competencies are adjustable per user."""
        mine = _org_with_teaching(db_session, "My Trust")
        _deliver_bank(db_session, mine)
        user = _member(db_session, "granted", mine, profession="consultant")
        user.additional_competencies = ["view_teaching_cases"]
        db_session.commit()

        _login(test_client, "granted")
        resp = _read(test_client)

        assert resp.status_code != 403


class TestSigningInIsStillRequired:
    """The existing guard is unchanged; the new checks sit behind it."""

    def test_an_anonymous_caller_is_refused(self, test_client: TestClient):
        assert _read(test_client).status_code == 401
