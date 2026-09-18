"""Teaching and passport rows name their place, and nothing else.

The organisation column is gone from these tables: written for one
deploy, read for another, then unwritten, then dropped.

The one exception is ``ModuleMediaLink.organisation_id``, which is where
the object sits in the bucket rather than who owns the row. It survives,
filled from the place, and the last test says so.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.features.teaching.models import (
    ModuleMediaLink,
    QuestionBankOrgStatus,
    TeachingOrgSettings,
)
from app.models import Organisation, OrgUnitFeature, User
from app.organisations import add_place_member, place_of_organisation
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
    add_place_member(db_session, org.org_unit_id, user.id, "staff")
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


class TestTheRowsNameTheirPlace:
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


class TestTheOrganisationColumnIsGone:
    """The tables have one id for one idea.

    Asserted on the mapped class rather than by writing a row: a stray
    keyword would be a ``TypeError`` either way, and this says what is
    being claimed.
    """

    def test_the_status_table_has_no_organisation_column(self) -> None:
        assert "organisation_id" not in QuestionBankOrgStatus.__table__.c

    def test_a_row_is_written_by_place_alone(
        self, db_session: Session, org: Organisation
    ) -> None:
        row = QuestionBankOrgStatus(
            org_unit_id=org.org_unit_id,
            question_bank_id="a-bank",
            is_live=True,
        )
        db_session.add(row)
        db_session.commit()

        assert row.org_unit_id == org.org_unit_id


class TestTheMediaLinkKeepsItsAddress:
    """The one column of this group that is still filled.

    Media objects live at ``{prefix}/{module}/{asset}``, and the signed
    cookie covers that path, so the number addresses a file rather than
    filtering a table. A row written without it would point nowhere.

    Which number that is belongs to the place —
    ``org_unit.media_prefix_id``, falling back to its own id — and
    ``test_the_media_prefix_survives_the_table`` covers the choice. Here
    it is only that the column is filled at all.
    """

    def test_naming_the_place_fills_the_bucket_prefix(
        self, db_session: Session, org: Organisation
    ) -> None:
        link = ModuleMediaLink(
            org_unit_id=org.org_unit_id,
            question_bank_id="a-bank",
            media_key="lecture-01",
            asset_id="asset-1",
            original_filename="asset-1.mp4",
            content_type="video/mp4",
            size_bytes=1024,
            uploaded_at=datetime.now(UTC),
        )
        db_session.add(link)
        db_session.commit()

        assert link.organisation_id == org.org_unit_id
