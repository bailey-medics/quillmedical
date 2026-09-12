"""Tests for the self-declared record routes.

Certificates, logbook entries, reflections and CPD: the holder's own
claims, entered by them, countersigned by nobody. The sign-off routes are
tested separately in ``test_passport_router.py``; what matters here is
the difference between the two kinds of record.

**These are editable and a sign-off is not.** A mistyped logbook date
should be fixable in seconds; a sign-off is immutable once signed and
corrected only by superseding it. The difference follows from who is
accountable for each, and both halves are asserted.

**Reflections are holder-only, and that is narrower than the rest.** An
assessor named on a request may read the sign-off they were asked about
and still may not read a reflection. Written reflection can be disclosed
in legal proceedings, so the test asserts a reader with legitimate access
to everything else is refused this.

**Counts, never comparisons.** The logbook returns how many entries there
are and nothing resembling a target.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.features.passport.store import LocalPassportStore
from app.main import app
from app.models import (
    Organisation,
    OrganisationFeature,
    User,
    organisation_member,
)
from app.passport_storage import get_passport_store
from app.security import hash_password

COMPETENCY = "prescribe_sact"
LEVEL = "review_and_authorise"


@pytest.fixture
def passport_store(tmp_path: Path) -> Iterator[LocalPassportStore]:
    """Point every route at a store under a temporary directory."""
    store = LocalPassportStore(tmp_path / "passports")
    app.dependency_overrides[get_passport_store] = lambda: store
    yield store
    app.dependency_overrides.pop(get_passport_store, None)


def _make_user(db: Session, username: str, *, profession: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.nhs.uk",
        full_name=f"Dr {username.title()}",
        password_hash=hash_password("PassportPassword123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        professional_registrations={"GMC": "1234567"},
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _login(client: TestClient, username: str) -> TestClient:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": "PassportPassword123!"},
    )
    assert response.status_code == 200, response.text

    csrf = client.cookies.get("XSRF-TOKEN")
    if csrf:
        client.headers["X-CSRF-Token"] = csrf

    return client


@pytest.fixture
def holder(db_session: Session) -> User:
    return _make_user(
        db_session, "holder", profession="specialty_trainee_3_plus"
    )


@pytest.fixture
def assessor(db_session: Session) -> User:
    return _make_user(db_session, "assessor", profession="consultant")


@pytest.fixture
def org(db_session: Session, holder: User, assessor: User) -> Organisation:
    org = Organisation(name="Test Trust")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    db_session.add(
        OrganisationFeature(organisation_id=org.id, feature_key="passport")
    )

    for user in (holder, assessor):
        db_session.execute(
            organisation_member.insert().values(
                organisation_id=org.id, user_id=user.id
            )
        )

    db_session.commit()
    return org


@pytest.fixture
def passport(
    test_client: TestClient,
    passport_store: LocalPassportStore,
    org: Organisation,
) -> tuple[TestClient, str]:
    """A holder with a passport, signed in."""
    client = _login(test_client, "holder")
    response = client.post("/api/passport")
    assert response.status_code == 201, response.text
    return client, str(response.json()["passport_id"])


class TestCertificates:
    def test_a_holder_can_file_one(
        self, passport: tuple[TestClient, str]
    ) -> None:
        client, passport_id = passport

        response = client.post(
            f"/api/passport/{passport_id}/certificates",
            json={
                "title": "SACT administration course",
                "issuer": "UKONS",
                "awarded_on": "2026-02-11",
                "competencies": [COMPETENCY],
            },
        )

        assert response.status_code == 201, response.text
        assert response.json()["name"]

    def test_it_reads_back(self, passport: tuple[TestClient, str]) -> None:
        client, passport_id = passport
        client.post(
            f"/api/passport/{passport_id}/certificates",
            json={
                "title": "SACT administration course",
                "issuer": "UKONS",
                "awarded_on": "2026-02-11",
                "competencies": [COMPETENCY],
            },
        )

        response = client.get(f"/api/passport/{passport_id}/certificates")

        assert response.status_code == 200, response.text
        body = response.json()
        assert len(body) == 1
        assert body[0]["title"] == "SACT administration course"
        assert body[0]["competencies"][0]["id"] == COMPETENCY

    def test_the_label_travels_with_the_id(
        self, passport: tuple[TestClient, str]
    ) -> None:
        """A record read years later must stay intelligible."""
        client, passport_id = passport
        client.post(
            f"/api/passport/{passport_id}/certificates",
            json={
                "title": "A course",
                "issuer": "UKONS",
                "awarded_on": "2026-02-11",
                "competencies": [COMPETENCY],
            },
        )

        body = client.get(f"/api/passport/{passport_id}/certificates").json()

        assert body[0]["competencies"][0]["name"]

    def test_it_can_be_corrected(
        self, passport: tuple[TestClient, str]
    ) -> None:
        """Self-declared evidence is editable, unlike a sign-off."""
        client, passport_id = passport
        created = client.post(
            f"/api/passport/{passport_id}/certificates",
            json={
                "title": "Typo in the title",
                "issuer": "UKONS",
                "awarded_on": "2026-02-11",
            },
        )
        name = created.json()["name"]

        response = client.patch(
            f"/api/passport/{passport_id}/certificates/{name}",
            json={
                "title": "The corrected title",
                "issuer": "UKONS",
                "awarded_on": "2026-02-11",
            },
        )

        assert response.status_code == 200, response.text

        body = client.get(f"/api/passport/{passport_id}/certificates").json()
        assert body[0]["title"] == "The corrected title"

    def test_it_can_be_removed(self, passport: tuple[TestClient, str]) -> None:
        client, passport_id = passport
        created = client.post(
            f"/api/passport/{passport_id}/certificates",
            json={
                "title": "Recorded in error",
                "issuer": "UKONS",
                "awarded_on": "2026-02-11",
            },
        )
        name = created.json()["name"]

        response = client.delete(
            f"/api/passport/{passport_id}/certificates/{name}"
        )

        assert response.status_code == 200, response.text
        assert (
            client.get(f"/api/passport/{passport_id}/certificates").json()
            == []
        )

    def test_an_unknown_competency_is_refused(
        self, passport: tuple[TestClient, str]
    ) -> None:
        client, passport_id = passport

        response = client.post(
            f"/api/passport/{passport_id}/certificates",
            json={
                "title": "A course",
                "issuer": "UKONS",
                "awarded_on": "2026-02-11",
                "competencies": ["not_a_competency"],
            },
        )

        assert response.status_code == 404

    def test_nobody_else_can_file_one(
        self, passport: tuple[TestClient, str], test_client: TestClient
    ) -> None:
        _, passport_id = passport
        other = _login(test_client, "assessor")

        response = other.post(
            f"/api/passport/{passport_id}/certificates",
            json={
                "title": "Not mine to add",
                "issuer": "UKONS",
                "awarded_on": "2026-02-11",
            },
        )

        assert response.status_code == 404


class TestLogbook:
    def test_a_holder_can_log_a_procedure(
        self, passport: tuple[TestClient, str]
    ) -> None:
        client, passport_id = passport

        response = client.post(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}",
            json={
                "performed_on": "2026-03-12",
                "setting": "Bristol Royal Infirmary",
                "supervision": "supervised",
                "outcome": "Successful",
            },
        )

        assert response.status_code == 201, response.text

    def test_the_logbook_counts_and_does_not_compare(
        self, passport: tuple[TestClient, str]
    ) -> None:
        """Activity is counted; whether it is enough is not this API's call."""
        client, passport_id = passport

        for day in ("2026-03-10", "2026-03-11", "2026-03-12"):
            client.post(
                f"/api/passport/{passport_id}/logbook/{COMPETENCY}",
                json={"performed_on": day},
            )

        response = client.get(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}"
        )

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["count"] == 3
        assert not any(
            key in body
            for key in ("target", "required", "progress", "complete")
        )

    def test_entries_sort_by_the_clinical_date(
        self, passport: tuple[TestClient, str]
    ) -> None:
        """Not by filename, which records when Quill wrote the file.

        A registrar logging five procedures on a Friday evening would
        otherwise see them ordered by when they typed them up rather
        than when they happened.
        """
        client, passport_id = passport

        for day in ("2026-03-20", "2026-03-02", "2026-03-11"):
            client.post(
                f"/api/passport/{passport_id}/logbook/{COMPETENCY}",
                json={"performed_on": day},
            )

        body = client.get(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}"
        ).json()

        dates = [entry["performed_on"] for entry in body["entries"]]
        assert dates == sorted(dates)

    def test_an_entry_can_be_corrected(
        self, passport: tuple[TestClient, str]
    ) -> None:
        client, passport_id = passport
        created = client.post(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}",
            json={"performed_on": "2026-03-12", "outcome": "Typo"},
        )
        stem = created.json()["name"]

        response = client.patch(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}/{stem}",
            json={"performed_on": "2026-03-12", "outcome": "Successful"},
        )

        assert response.status_code == 200, response.text

        body = client.get(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}"
        ).json()
        assert body["entries"][0]["outcome"] == "Successful"

    def test_an_entry_can_be_removed(
        self, passport: tuple[TestClient, str]
    ) -> None:
        client, passport_id = passport
        created = client.post(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}",
            json={"performed_on": "2026-03-12"},
        )
        stem = created.json()["name"]

        response = client.delete(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}/{stem}"
        )

        assert response.status_code == 200, response.text

        body = client.get(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}"
        ).json()
        assert body["count"] == 0

    def test_a_failure_is_recorded_like_anything_else(
        self, passport: tuple[TestClient, str]
    ) -> None:
        """A record that only showed successes would be worth less."""
        client, passport_id = passport

        response = client.post(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}",
            json={
                "performed_on": "2026-03-12",
                "outcome": "Abandoned — patient could not tolerate",
            },
        )

        assert response.status_code == 201, response.text


class TestReflections:
    def test_a_holder_can_write_one(
        self, passport: tuple[TestClient, str]
    ) -> None:
        client, passport_id = passport

        response = client.post(
            f"/api/passport/{passport_id}/reflections",
            json={
                "title": "A difficult airway",
                "written_on": "2026-03-14",
                "body": "What I learned, with nothing identifying.",
                "anonymised_confirmed": True,
            },
        )

        assert response.status_code == 201, response.text

    def test_the_anonymisation_confirmation_is_required(
        self, passport: tuple[TestClient, str]
    ) -> None:
        """One of two places patient data could enter a passport."""
        client, passport_id = passport

        response = client.post(
            f"/api/passport/{passport_id}/reflections",
            json={
                "title": "A difficult airway",
                "written_on": "2026-03-14",
                "body": "What I learned.",
                "anonymised_confirmed": False,
            },
        )

        assert response.status_code == 400

    def test_the_prose_reads_back(
        self, passport: tuple[TestClient, str]
    ) -> None:
        client, passport_id = passport
        client.post(
            f"/api/passport/{passport_id}/reflections",
            json={
                "title": "A difficult airway",
                "written_on": "2026-03-14",
                "body": "The writing itself, which is the substance.",
                "anonymised_confirmed": True,
            },
        )

        response = client.get(f"/api/passport/{passport_id}/reflections")

        assert response.status_code == 200, response.text
        body = response.json()
        assert len(body) == 1
        assert "the substance" in body[0]["body"]

    def test_an_assessor_cannot_read_reflections(
        self,
        passport: tuple[TestClient, str],
        test_client: TestClient,
        assessor: User,
    ) -> None:
        """The narrowest rule in the passport, and deliberately so.

        This assessor is named on a request against the passport, so they
        may read the sign-off they were asked about. They still may not
        read a reflection: written reflection can be disclosed in legal
        proceedings, and UK doctors are wary of it for good reason.
        """
        client, passport_id = passport
        client.post(
            f"/api/passport/{passport_id}/reflections",
            json={
                "title": "A difficult airway",
                "written_on": "2026-03-14",
                "body": "Private.",
                "anonymised_confirmed": True,
            },
        )
        client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_user_id": assessor.id,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )

        other = _login(test_client, "assessor")
        response = other.get(f"/api/passport/{passport_id}/reflections")

        assert response.status_code == 404

    def test_one_can_be_removed(
        self, passport: tuple[TestClient, str]
    ) -> None:
        client, passport_id = passport
        created = client.post(
            f"/api/passport/{passport_id}/reflections",
            json={
                "title": "Written in error",
                "written_on": "2026-03-14",
                "body": "Not meant to be kept.",
                "anonymised_confirmed": True,
            },
        )
        name = created.json()["name"]

        response = client.delete(
            f"/api/passport/{passport_id}/reflections/{name}"
        )

        assert response.status_code == 200, response.text
        assert (
            client.get(f"/api/passport/{passport_id}/reflections").json() == []
        )


class TestCpd:
    def test_a_holder_can_record_an_activity(
        self, passport: tuple[TestClient, str]
    ) -> None:
        client, passport_id = passport

        response = client.post(
            f"/api/passport/{passport_id}/cpd",
            json={
                "activity_on": "2026-02-11",
                "title": "Regional oncology study day",
                "activity_type": "teaching day",
                "hours": 6,
            },
        )

        assert response.status_code == 201, response.text

    def test_activities_read_back_by_year(
        self, passport: tuple[TestClient, str]
    ) -> None:
        """Grouped by year because UK appraisal asks what you did this year."""
        client, passport_id = passport
        client.post(
            f"/api/passport/{passport_id}/cpd",
            json={
                "activity_on": "2026-02-11",
                "title": "Regional oncology study day",
                "activity_type": "teaching day",
                "hours": 6,
            },
        )

        response = client.get(f"/api/passport/{passport_id}/cpd/2026")

        assert response.status_code == 200, response.text
        body = response.json()
        assert len(body) == 1
        assert body[0]["hours"] == 6

    def test_an_activity_can_be_corrected(
        self, passport: tuple[TestClient, str]
    ) -> None:
        client, passport_id = passport
        created = client.post(
            f"/api/passport/{passport_id}/cpd",
            json={
                "activity_on": "2026-02-11",
                "title": "Wrong hours",
                "activity_type": "conference",
                "hours": 60,
            },
        )
        stem = created.json()["name"]

        response = client.patch(
            f"/api/passport/{passport_id}/cpd/2026/{stem}",
            json={
                "activity_on": "2026-02-11",
                "title": "Wrong hours",
                "activity_type": "conference",
                "hours": 6,
            },
        )

        assert response.status_code == 200, response.text

        body = client.get(f"/api/passport/{passport_id}/cpd/2026").json()
        assert body[0]["hours"] == 6

    def test_an_activity_can_be_removed(
        self, passport: tuple[TestClient, str]
    ) -> None:
        client, passport_id = passport
        created = client.post(
            f"/api/passport/{passport_id}/cpd",
            json={
                "activity_on": "2026-02-11",
                "title": "Recorded in error",
                "activity_type": "course",
            },
        )
        stem = created.json()["name"]

        response = client.delete(
            f"/api/passport/{passport_id}/cpd/2026/{stem}"
        )

        assert response.status_code == 200, response.text
        assert client.get(f"/api/passport/{passport_id}/cpd/2026").json() == []


class TestEvidenceNotYetBuilt:
    def test_naming_an_attachment_is_refused_rather_than_ignored(
        self, passport: tuple[TestClient, str]
    ) -> None:
        """A caller believing evidence attached when it did not is worse.

        Upload lands in its own unit. Until then a record may name no
        attachments, and naming one is an error rather than a silent
        drop.
        """
        client, passport_id = passport

        response = client.post(
            f"/api/passport/{passport_id}/certificates",
            json={
                "title": "A course",
                "issuer": "UKONS",
                "awarded_on": "2026-02-11",
                "attachment_hashes": ["sha256:" + "ab" * 32],
            },
        )

        assert response.status_code == 501
