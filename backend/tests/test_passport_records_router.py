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

from app.features.passport import router
from app.features.passport.models import PassportLogbookConfirmationRequest
from app.features.passport.store import LocalPassportStore
from app.main import app
from app.models import (
    OrgUnit,
    OrgUnitFeature,
    User,
)
from app.organisations import add_org_unit_member
from app.passport_storage import get_passport_store
from app.security import hash_password
from tests.competencies import hold
from tests.registrations import declare

COMPETENCY = "uk_sact_board_2023_prescribe_sact"
# The frameworks a test holder works to. A passport offers the
# competencies in its holder's frameworks and no others, so one made with
# none could record nothing.
WORKING_TO = {"frameworks": ["clinical", "uk_sact_board_2023"]}
# What a sign-off for it covers. It is signed off one tumour site at a
# time, so every request names one.
SCOPE = "lung"
LEVEL = "review_and_authorise"


@pytest.fixture
def passport_store(tmp_path: Path) -> Iterator[LocalPassportStore]:
    """Point every route at a store under a temporary directory."""
    store = LocalPassportStore(tmp_path / "passports")
    app.dependency_overrides[get_passport_store] = lambda: store
    yield store
    app.dependency_overrides.pop(get_passport_store, None)


def _make_user(
    db: Session, username: str, *, profession: str, writes: bool = False
) -> User:
    """A user, optionally holding ``passport_write``.

    No profession grants ``passport_write``: it is sold, and reaches a
    person through onboarding or an individual subscription, and always
    with a term, so a fixture holder gets a dated ``passport_write`` row.
    """
    user = User(
        username=username,
        email=f"{username}@example.nhs.uk",
        full_name=f"Dr {username.title()}",
        password_hash=hash_password("PassportPassword123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
    )
    declare(user, {"GMC": "1234567"})
    if writes:
        hold(user, "passport_write")
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
        db_session,
        "holder",
        profession="specialty_trainee_3_plus",
        writes=True,
    )


@pytest.fixture
def assessor(db_session: Session) -> User:
    return _make_user(db_session, "assessor", profession="consultant")


@pytest.fixture
def org(db_session: Session, holder: User, assessor: User) -> OrgUnit:
    org = OrgUnit(name="Test Trust", type="hospital_team")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    db_session.add(OrgUnitFeature(org_unit_id=org.id, feature_key="passport"))

    for user in (holder, assessor):
        add_org_unit_member(db_session, org.id, user.id, "trainee")

    db_session.commit()
    return org


@pytest.fixture
def passport(
    test_client: TestClient,
    passport_store: LocalPassportStore,
    org: OrgUnit,
) -> tuple[TestClient, str]:
    """A holder with a passport, signed in."""
    client = _login(test_client, "holder")
    response = client.post("/api/passport", json=WORKING_TO)
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
                "scope_id": SCOPE,
                "setting": "Bristol Royal Infirmary",
                "supervision": "supervised",
                "outcome": "Successful",
            },
        )

        assert response.status_code == 201, response.text

    def test_an_entry_can_say_which_scope_it_counts_towards(
        self, passport: tuple[TestClient, str]
    ) -> None:
        client, passport_id = passport

        response = client.post(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}",
            json={"performed_on": "2026-03-12", "scope_id": SCOPE},
        )
        assert response.status_code == 201, response.text

        body = client.get(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}"
        ).json()
        assert body["entries"][0]["scope"] == {"id": SCOPE, "name": "Lung"}

    def test_a_scope_is_required_where_the_competency_has_them(
        self, passport: tuple[TestClient, str]
    ) -> None:
        """As on a sign-off, whether or not anything is signed yet.

        An entry with no scope counts towards no sign-off, so the holder
        would find it missing from the evidence the day they asked.
        """
        client, passport_id = passport

        response = client.post(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}",
            json={"performed_on": "2026-03-12"},
        )

        assert response.status_code == 400, response.text
        assert response.json()["detail"] == (
            "Choose what this entry counts towards."
        )
        assert (
            client.get(
                f"/api/passport/{passport_id}/logbook/{COMPETENCY}"
            ).json()["count"]
            == 0
        )

    def test_a_competency_with_no_scopes_needs_none(
        self, passport: tuple[TestClient, str]
    ) -> None:
        client, passport_id = passport

        response = client.post(
            f"/api/passport/{passport_id}/logbook/perform_cannulation",
            json={"performed_on": "2026-03-12"},
        )

        assert response.status_code == 201, response.text

    def test_a_scope_the_competency_does_not_declare_is_refused(
        self, passport: tuple[TestClient, str]
    ) -> None:
        client, passport_id = passport

        response = client.post(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}",
            json={"performed_on": "2026-03-12", "scope_id": "left_elbow"},
        )

        assert response.status_code == 400, response.text
        assert "left_elbow" not in response.json()["detail"]

    def test_a_scope_on_a_competency_with_none_is_refused(
        self, passport: tuple[TestClient, str]
    ) -> None:
        client, passport_id = passport

        response = client.post(
            f"/api/passport/{passport_id}/logbook/perform_cannulation",
            json={"performed_on": "2026-03-12", "scope_id": SCOPE},
        )

        assert response.status_code == 400, response.text

    def test_amending_an_entry_can_change_its_scope_and_not_clear_it(
        self, passport: tuple[TestClient, str]
    ) -> None:
        client, passport_id = passport
        stem = client.post(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}",
            json={"performed_on": "2026-03-12", "scope_id": SCOPE},
        ).json()["name"]
        url = f"/api/passport/{passport_id}/logbook/{COMPETENCY}"

        changed = client.patch(
            f"{url}/{stem}",
            json={"performed_on": "2026-03-12", "scope_id": "breast"},
        )
        assert changed.status_code == 200, changed.text
        assert client.get(url).json()["entries"][0]["scope"]["id"] == (
            "breast"
        )

        cleared = client.patch(
            f"{url}/{stem}", json={"performed_on": "2026-03-12"}
        )
        assert cleared.status_code == 400, cleared.text
        assert client.get(url).json()["entries"][0]["scope"]["id"] == (
            "breast"
        )

    def test_the_logbook_counts_and_does_not_compare(
        self, passport: tuple[TestClient, str]
    ) -> None:
        """Activity is counted; whether it is enough is not this API's call."""
        client, passport_id = passport

        for day in ("2026-03-10", "2026-03-11", "2026-03-12"):
            client.post(
                f"/api/passport/{passport_id}/logbook/{COMPETENCY}",
                json={"performed_on": day, "scope_id": SCOPE},
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
                json={"performed_on": day, "scope_id": SCOPE},
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
            json={
                "performed_on": "2026-03-12",
                "outcome": "Typo",
                "scope_id": SCOPE,
            },
        )
        stem = created.json()["name"]

        response = client.patch(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}/{stem}",
            json={
                "performed_on": "2026-03-12",
                "outcome": "Successful",
                "scope_id": SCOPE,
            },
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
            json={"performed_on": "2026-03-12", "scope_id": SCOPE},
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
                "scope_id": SCOPE,
                "outcome": "Abandoned - patient could not tolerate",
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
                "assessor_email": assessor.email,
                "scope_id": SCOPE,
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
                "points": 6,
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
                "points": 6,
            },
        )

        response = client.get(f"/api/passport/{passport_id}/cpd/2026")

        assert response.status_code == 200, response.text
        body = response.json()
        assert len(body) == 1
        assert body[0]["points"] == 6

    def test_an_activity_can_be_corrected(
        self, passport: tuple[TestClient, str]
    ) -> None:
        client, passport_id = passport
        created = client.post(
            f"/api/passport/{passport_id}/cpd",
            json={
                "activity_on": "2026-02-11",
                "title": "Wrong points",
                "activity_type": "conference",
                "points": 60,
            },
        )
        stem = created.json()["name"]

        response = client.patch(
            f"/api/passport/{passport_id}/cpd/2026/{stem}",
            json={
                "activity_on": "2026-02-11",
                "title": "Wrong points",
                "activity_type": "conference",
                "points": 6,
            },
        )

        assert response.status_code == 200, response.text

        body = client.get(f"/api/passport/{passport_id}/cpd/2026").json()
        assert body[0]["points"] == 6

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
                "attachments": [
                    {
                        "hash": "sha256:" + "ab" * 32,
                        "filename": "certificate.pdf",
                        "size_bytes": 1,
                        "media_type": "application/pdf",
                    }
                ],
            },
        )

        # Evidence must be uploaded before a record may name it. A
        # record pointing at a blob that is not there would be a
        # dangling reference in a document whose whole claim is that it
        # can be checked years later.
        assert response.status_code == 400


class TestConfirmingALogbookEntry:
    """A supervisor's name beside one entry, as a paper log carries it.

    Optional and asked for by the holder. It says the procedure happened
    as recorded, and nothing about competence: that is a sign-off.
    """

    URL = "/api/passport/requests/logbook-confirmations"

    @pytest.fixture
    def mailed(self, monkeypatch: pytest.MonkeyPatch) -> list[str]:
        sent: list[str] = []
        monkeypatch.setattr(
            router, "send_email", lambda **kw: sent.append(str(kw["to"]))
        )
        return sent

    def _log(
        self,
        client: TestClient,
        passport_id: str,
        supervisor: User | None,
    ) -> str:
        body: dict[str, object] = {
            "performed_on": "2026-03-12",
            "scope_id": SCOPE,
        }
        if supervisor is not None:
            body["confirmer_email"] = supervisor.email
        response = client.post(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}", json=body
        )
        assert response.status_code == 201, response.text
        return str(response.json()["name"])

    def _ask(self, db: Session) -> PassportLogbookConfirmationRequest:
        row = db.query(PassportLogbookConfirmationRequest).one()
        return row

    def _entry(
        self, client: TestClient, passport_id: str
    ) -> dict[str, object]:
        body = client.get(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}"
        ).json()
        return dict(body["entries"][0])

    def test_nobody_is_asked_unless_the_holder_names_somebody(
        self,
        passport: tuple[TestClient, str],
        db_session: Session,
        mailed: list[str],
    ) -> None:
        client, passport_id = passport

        self._log(client, passport_id, None)

        assert mailed == []
        assert (
            db_session.query(PassportLogbookConfirmationRequest).count() == 0
        )
        entry = self._entry(client, passport_id)
        assert entry["confirmation_asked_of"] is None
        assert entry["confirmed_by"] is None

    def test_naming_a_supervisor_emails_them_and_records_the_ask(
        self,
        passport: tuple[TestClient, str],
        assessor: User,
        db_session: Session,
        mailed: list[str],
    ) -> None:
        client, passport_id = passport

        stem = self._log(client, passport_id, assessor)

        assert mailed == [assessor.email]
        ask = self._ask(db_session)
        assert ask.entry_stem == stem
        assert ask.status == "open"
        assert self._entry(client, passport_id)["confirmation_asked_of"] == (
            assessor.email
        )

    def test_a_holder_cannot_ask_themselves(
        self,
        passport: tuple[TestClient, str],
        holder: User,
        mailed: list[str],
    ) -> None:
        client, passport_id = passport

        response = client.post(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}",
            json={
                "performed_on": "2026-03-12",
                "scope_id": SCOPE,
                "confirmer_email": holder.email,
            },
        )

        assert response.status_code == 400, response.text
        assert mailed == []

    def test_a_failed_email_saves_no_entry_and_no_ask(
        self,
        passport: tuple[TestClient, str],
        assessor: User,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """As with a sign-off request: no mail, no ask."""
        client, passport_id = passport

        def _explode(**_kwargs: object) -> None:
            raise RuntimeError("mail server unreachable")

        monkeypatch.setattr(router, "send_email", _explode)

        response = client.post(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}",
            json={
                "performed_on": "2026-03-12",
                "scope_id": SCOPE,
                "confirmer_email": assessor.email,
            },
        )

        assert response.status_code == 502, response.text
        assert (
            db_session.query(PassportLogbookConfirmationRequest).count() == 0
        )
        assert (
            client.get(
                f"/api/passport/{passport_id}/logbook/{COMPETENCY}"
            ).json()["count"]
            == 0
        )

    def test_the_supervisor_reads_that_entry_and_confirms_it(
        self,
        passport: tuple[TestClient, str],
        assessor: User,
        db_session: Session,
        mailed: list[str],
    ) -> None:
        client, passport_id = passport
        self._log(client, passport_id, assessor)
        ask_id = self._ask(db_session).id

        supervisor = _login(client, "assessor")
        shown = supervisor.get(f"{self.URL}/{ask_id}")
        assert shown.status_code == 200, shown.text
        assert shown.json()["holder_name"] == "Dr Holder"
        assert shown.json()["entry"]["performed_on"] == "2026-03-12"

        answer = supervisor.post(
            f"{self.URL}/{ask_id}", json={"confirmed": True}
        )
        assert answer.status_code == 200, answer.text
        assert answer.json() == {"status": "confirmed"}

        db_session.expire_all()
        assert self._ask(db_session).status == "confirmed"

        holder_client = _login(client, "holder")
        entry = self._entry(holder_client, passport_id)
        confirmed_by = entry["confirmed_by"]
        assert isinstance(confirmed_by, dict)
        assert confirmed_by["name"] == "Dr Assessor"
        assert confirmed_by["registrations"] == [
            {"body": "GMC", "number": "1234567"}
        ]
        assert entry["confirmed_at"] is not None
        assert entry["confirmation_asked_of"] is None

    def test_an_answered_ask_cannot_be_answered_again(
        self,
        passport: tuple[TestClient, str],
        assessor: User,
        db_session: Session,
        mailed: list[str],
    ) -> None:
        client, passport_id = passport
        self._log(client, passport_id, assessor)
        ask_id = self._ask(db_session).id
        supervisor = _login(client, "assessor")
        supervisor.post(f"{self.URL}/{ask_id}", json={"confirmed": True})

        again = supervisor.post(
            f"{self.URL}/{ask_id}", json={"confirmed": True}
        )

        assert again.status_code == 404, again.text

    def test_declining_closes_the_ask_and_leaves_the_entry_alone(
        self,
        passport: tuple[TestClient, str],
        assessor: User,
        db_session: Session,
        mailed: list[str],
    ) -> None:
        client, passport_id = passport
        self._log(client, passport_id, assessor)
        ask_id = self._ask(db_session).id

        supervisor = _login(client, "assessor")
        answer = supervisor.post(
            f"{self.URL}/{ask_id}", json={"confirmed": False}
        )
        assert answer.json() == {"status": "declined"}

        holder_client = _login(client, "holder")
        entry = self._entry(holder_client, passport_id)
        assert entry["confirmed_by"] is None
        assert entry["confirmation_asked_of"] is None

    def test_somebody_who_was_not_asked_is_told_nothing(
        self,
        passport: tuple[TestClient, str],
        assessor: User,
        org: OrgUnit,
        db_session: Session,
        mailed: list[str],
    ) -> None:
        """Not even that there is something to confirm."""
        client, passport_id = passport
        # A colleague where the passport is switched on, so it is the ask
        # that refuses them and not the feature.
        bystander_user = _make_user(
            db_session, "bystander", profession="consultant"
        )
        add_org_unit_member(db_session, org.id, bystander_user.id, "staff")
        db_session.commit()
        self._log(client, passport_id, assessor)
        ask_id = self._ask(db_session).id

        bystander = _login(client, "bystander")

        assert bystander.get(f"{self.URL}/{ask_id}").status_code == 404
        assert (
            bystander.post(
                f"{self.URL}/{ask_id}", json={"confirmed": True}
            ).status_code
            == 404
        )

    def test_being_asked_opens_nothing_else_of_the_passport(
        self,
        passport: tuple[TestClient, str],
        assessor: User,
        db_session: Session,
        mailed: list[str],
    ) -> None:
        client, passport_id = passport
        self._log(client, passport_id, assessor)

        supervisor = _login(client, "assessor")

        assert (
            supervisor.get(
                f"/api/passport/{passport_id}/logbook/{COMPETENCY}"
            ).status_code
            == 404
        )

    def test_amending_a_confirmed_entry_clears_the_confirmation(
        self,
        passport: tuple[TestClient, str],
        assessor: User,
        db_session: Session,
        mailed: list[str],
    ) -> None:
        """They confirmed what it said then, not what it says now."""
        client, passport_id = passport
        stem = self._log(client, passport_id, assessor)
        ask_id = self._ask(db_session).id
        _login(client, "assessor").post(
            f"{self.URL}/{ask_id}", json={"confirmed": True}
        )

        holder_client = _login(client, "holder")
        changed = holder_client.patch(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}/{stem}",
            json={"performed_on": "2026-03-13", "scope_id": SCOPE},
        )
        assert changed.status_code == 200, changed.text

        assert self._entry(holder_client, passport_id)["confirmed_by"] is None

    def test_asking_again_on_an_amended_entry_reopens_the_one_ask(
        self,
        passport: tuple[TestClient, str],
        assessor: User,
        db_session: Session,
        mailed: list[str],
    ) -> None:
        client, passport_id = passport
        stem = self._log(client, passport_id, assessor)
        ask_id = self._ask(db_session).id
        _login(client, "assessor").post(
            f"{self.URL}/{ask_id}", json={"confirmed": True}
        )

        holder_client = _login(client, "holder")
        holder_client.patch(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}/{stem}",
            json={
                "performed_on": "2026-03-13",
                "scope_id": SCOPE,
                "confirmer_email": assessor.email,
            },
        )

        db_session.expire_all()
        ask = self._ask(db_session)
        assert ask.id == ask_id
        assert ask.status == "open"
        assert mailed == [assessor.email, assessor.email]

    def test_removing_an_entry_removes_its_ask(
        self,
        passport: tuple[TestClient, str],
        assessor: User,
        db_session: Session,
        mailed: list[str],
    ) -> None:
        client, passport_id = passport
        stem = self._log(client, passport_id, assessor)

        client.delete(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}/{stem}"
        )

        assert (
            db_session.query(PassportLogbookConfirmationRequest).count() == 0
        )
