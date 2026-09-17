"""Teaching and passport rows carry a place id as well as an organisation.

The expand step of moving these tables off ``organisations.id``. Every
one of them answers "which organisation?" with a row id from a table
that is going, so each gains a place id beside it: written from this
deploy, read from the next, and the older column dropped in the one
after.

What matters here is that both are written *together*. A row with only
the old column is invisible to the code that reads the new one, and
nothing would say so — the reader would simply find less than there is.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.features.teaching.models import (
    QuestionBankOrgStatus,
    TeachingOrgSettings,
)
from app.models import Organisation, OrgUnitFeature, User
from app.organisations import add_organisation_member, place_of_organisation
from app.security import hash_password


@pytest.fixture
def org(db_session: Session) -> Organisation:
    organisation = Organisation(name="Teaching Trust", type="hospital_team")
    db_session.add(organisation)
    db_session.commit()
    db_session.refresh(organisation)
    db_session.add(
        OrgUnitFeature(
            org_unit_id=organisation.org_unit_id, feature_key="teaching"
        )
    )
    db_session.commit()
    return organisation


@pytest.fixture
def educator(db_session: Session, org: Organisation) -> User:
    user = User(
        username="an_educator",
        email="educator@example.com",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="teaching_admin",
    )
    db_session.add(user)
    db_session.commit()
    add_organisation_member(db_session, org.id, user.id, "staff")
    db_session.commit()
    db_session.refresh(user)
    return user


def _login(client: TestClient) -> dict[str, str]:
    resp = client.post(
        "/api/auth/login",
        json={"username": "an_educator", "password": "Password123!"},
    )
    assert resp.status_code == 200, resp.text
    return {"X-CSRF-Token": client.cookies.get("XSRF-TOKEN", "")}


class TestThePlaceIsWrittenBeside:
    def test_the_two_ids_are_not_the_same_number(
        self, db_session: Session, org: Organisation
    ) -> None:
        """Otherwise the tests below would pass whichever was written.

        The fixture in ``conftest`` keeps the two sequences apart for
        exactly this reason.
        """
        assert org.id != org.org_unit_id

    def test_teaching_settings_name_the_place(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        educator: User,
    ) -> None:
        headers = _login(test_client)

        resp = test_client.put(
            "/api/teaching/settings",
            json={
                "coordinator_email": "coord@example.com",
                "institution_name": "A Medical School",
            },
            headers=headers,
        )

        assert resp.status_code == 200, resp.text
        row = db_session.query(TeachingOrgSettings).one()
        assert row.organisation_id == org.id
        assert row.org_unit_id == org.org_unit_id


class TestTheTranslation:
    def test_it_names_the_place_an_organisation_stands_for(
        self, db_session: Session, org: Organisation
    ) -> None:
        assert place_of_organisation(db_session, org.id) == org.org_unit_id

    def test_an_organisation_that_does_not_exist_names_nothing(
        self, db_session: Session
    ) -> None:
        assert place_of_organisation(db_session, 999999) is None


class TestEitherIdAloneIsEnough:
    """A writer may name either, and the row carries both.

    Eight tables and more writers than the eight places the application
    creates these rows — fixtures, scripts, and whatever is written
    next. A row carrying only one of the two is invisible to half the
    code and nothing says so, so the pair is kept in step by a listener
    rather than by remembering.
    """

    def test_naming_the_organisation_fills_the_place(
        self, db_session: Session, org: Organisation
    ) -> None:
        row = QuestionBankOrgStatus(
            organisation_id=org.id,
            question_bank_id="a-bank",
            is_live=True,
        )
        db_session.add(row)
        db_session.commit()

        assert row.org_unit_id == org.org_unit_id

    def test_naming_the_place_fills_the_organisation(
        self, db_session: Session, org: Organisation
    ) -> None:
        row = QuestionBankOrgStatus(
            org_unit_id=org.org_unit_id,
            question_bank_id="another-bank",
            is_live=True,
        )
        db_session.add(row)
        db_session.commit()

        assert row.organisation_id == org.id
