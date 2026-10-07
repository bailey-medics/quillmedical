"""Tests for the frameworks a holder works to, and which they are offered.

``frameworks_for`` decides which frameworks somebody is offered and in
what order, and ``GET /api/passport/frameworks`` hands it to the page. A
holder's own choice is stored in their profile. See Phase 7 of
docs/docs/plans/2026-10-07-passport-registrar-portfolios-plan.md.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.cbac.competencies import FRAMEWORK_IDS, FRAMEWORKS
from app.features.passport import frameworks, schemas
from app.features.passport.frameworks import frameworks_for
from app.features.passport.models import OrgUnitPassportFramework
from app.features.passport.serialise import from_yaml
from app.features.passport.store import LocalPassportStore
from app.main import app
from app.models import OrgUnit, OrgUnitFeature, User
from app.organisations import add_org_unit_member
from app.passport_storage import get_passport_store
from app.security import hash_password
from tests.competencies import hold
from tests.places import administers
from tests.registrations import declare

# Two frameworks the catalogue is known to hold, named here so a change
# to it surfaces as one failure.
GENERAL = "clinical"
ONCOLOGY = "oncology"


def _make_user(
    db: Session,
    username: str,
    *,
    profession: str = "consultant",
    writes: bool = False,
) -> User:
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


def _organisation(
    db: Session, name: str, *leads: str, members: tuple[User, ...] = ()
) -> OrgUnit:
    """An organisation with the passport on, these leads and these members."""
    org = OrgUnit(name=name, type="hospital_team")
    db.add(org)
    db.commit()
    db.refresh(org)

    db.add(OrgUnitFeature(org_unit_id=org.id, feature_key="passport"))
    for position, framework_id in enumerate(leads, start=1):
        db.add(
            OrgUnitPassportFramework(
                org_unit_id=org.id,
                framework_id=framework_id,
                position=position,
            )
        )
    for member in members:
        add_org_unit_member(db, org.id, member.id, "staff")
    db.commit()
    return org


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


def _ids(db: Session, user: User, **filters: str) -> list[str]:
    return [c.framework.id for c in frameworks_for(db, user.id, **filters)]


class TestTheCatalogue:
    def test_the_two_existing_files_are_frameworks(self) -> None:
        assert GENERAL in FRAMEWORK_IDS
        assert ONCOLOGY in FRAMEWORK_IDS


class TestWhatAHolderIsOffered:
    def test_with_no_leads_it_is_alphabetical_by_name(
        self, db_session: Session
    ) -> None:
        holder = _make_user(db_session, "holder")
        _organisation(db_session, "Plain Trust", members=(holder,))

        offered = frameworks_for(db_session, holder.id)

        names = [choice.framework.name for choice in offered]
        assert names == sorted(names, key=str.casefold)
        assert {choice.framework.id for choice in offered} == set(
            FRAMEWORK_IDS
        )
        assert not any(choice.lead for choice in offered)

    def test_an_organisations_leads_come_first(
        self, db_session: Session
    ) -> None:
        holder = _make_user(db_session, "holder")
        _organisation(
            db_session, "Oncology Department", ONCOLOGY, members=(holder,)
        )

        offered = frameworks_for(db_session, holder.id)

        assert offered[0].framework.id == ONCOLOGY
        assert offered[0].lead is True
        assert not any(choice.lead for choice in offered[1:])

    def test_a_lead_whose_file_has_gone_is_skipped(
        self, db_session: Session
    ) -> None:
        holder = _make_user(db_session, "holder")
        _organisation(
            db_session, "Old Trust", "withdrawn_sheet", members=(holder,)
        )

        assert "withdrawn_sheet" not in _ids(db_session, holder)

    def test_each_says_how_many_competencies_it_holds(
        self, db_session: Session
    ) -> None:
        holder = _make_user(db_session, "holder")

        offered = frameworks_for(db_session, holder.id)

        assert all(choice.items > 0 for choice in offered)


class TestSearchAndFilter:
    def test_words_are_found_in_the_name_in_any_case(
        self, db_session: Session
    ) -> None:
        holder = _make_user(db_session, "holder")

        assert _ids(db_session, holder, query="GENERAL skills") == [GENERAL]

    def test_words_are_found_in_the_publisher_too(
        self, db_session: Session
    ) -> None:
        holder = _make_user(db_session, "holder")
        publisher = FRAMEWORKS[0].publisher.split()[0]

        assert FRAMEWORKS[0].id in _ids(db_session, holder, query=publisher)

    def test_every_word_must_match(self, db_session: Session) -> None:
        holder = _make_user(db_session, "holder")

        assert _ids(db_session, holder, query="general zebra") == []

    def test_a_blank_search_keeps_everything(
        self, db_session: Session
    ) -> None:
        holder = _make_user(db_session, "holder")

        assert set(_ids(db_session, holder, query="  ")) == set(FRAMEWORK_IDS)

    def test_a_specialty_keeps_its_frameworks(
        self, db_session: Session
    ) -> None:
        holder = _make_user(db_session, "holder")

        assert ONCOLOGY in _ids(db_session, holder, specialty="oncology")
        assert ONCOLOGY not in _ids(
            db_session, holder, specialty="haematology"
        )

    def test_a_framework_filed_under_no_specialty_is_never_filtered_out(
        self, db_session: Session
    ) -> None:
        """General clinical skills belong to every specialty."""
        holder = _make_user(db_session, "holder")

        assert GENERAL in _ids(db_session, holder, specialty="haematology")

    def test_an_unlisted_specialty_is_refused(
        self, db_session: Session
    ) -> None:
        holder = _make_user(db_session, "holder")

        with pytest.raises(frameworks.UnknownSpecialtyFilterError):
            frameworks_for(db_session, holder.id, specialty="left_elbow")


class TestChoosing:
    def test_a_choice_is_stored_with_its_name(self) -> None:
        refs = frameworks.framework_refs([GENERAL])

        assert refs == [
            schemas.FrameworkRef(id=GENERAL, name="General clinical skills")
        ]

    def test_an_unknown_framework_is_refused_without_echoing_it(
        self,
    ) -> None:
        with pytest.raises(frameworks.UnknownFrameworkError) as raised:
            frameworks.framework_refs(["left_elbow"])

        assert "left_elbow" not in str(raised.value)

    def test_a_framework_is_chosen_once(self) -> None:
        with pytest.raises(frameworks.UnknownFrameworkError, match="once"):
            frameworks.framework_refs([GENERAL, GENERAL])

    def test_a_profile_written_before_frameworks_still_loads(self) -> None:
        profile = from_yaml(
            schemas.Profile, "user_id: '1'\nname: Dr Sam Reeve\n"
        )

        assert profile.frameworks == []


@pytest.fixture
def passport_store(tmp_path: Path) -> Iterator[LocalPassportStore]:
    store = LocalPassportStore(tmp_path / "passports")
    app.dependency_overrides[get_passport_store] = lambda: store
    yield store
    app.dependency_overrides.pop(get_passport_store, None)


class TestTheHoldersRoutes:
    @pytest.fixture
    def holder_client(
        self,
        db_session: Session,
        test_client: TestClient,
        passport_store: LocalPassportStore,
    ) -> TestClient:
        holder = _make_user(db_session, "holder", writes=True)
        _organisation(
            db_session, "Oncology Department", ONCOLOGY, members=(holder,)
        )
        return _login(test_client, "holder")

    def test_the_list_carries_what_a_page_needs(
        self, holder_client: TestClient
    ) -> None:
        response = holder_client.get("/api/passport/frameworks")

        assert response.status_code == 200, response.text
        first = response.json()[0]
        assert first["id"] == ONCOLOGY
        assert first["lead"] is True
        assert set(first) == {
            "id",
            "name",
            "publisher",
            "version",
            "specialties",
            "lead",
            "items",
        }

    def test_the_list_can_be_searched_and_filtered(
        self, holder_client: TestClient
    ) -> None:
        found = holder_client.get(
            "/api/passport/frameworks", params={"q": "general"}
        )
        filtered = holder_client.get(
            "/api/passport/frameworks", params={"specialty": "haematology"}
        )

        assert [f["id"] for f in found.json()] == [GENERAL]
        assert ONCOLOGY not in [f["id"] for f in filtered.json()]

    def test_an_unlisted_specialty_is_a_400(
        self, holder_client: TestClient
    ) -> None:
        response = holder_client.get(
            "/api/passport/frameworks", params={"specialty": "left_elbow"}
        )

        assert response.status_code == 400, response.text

    def test_a_passport_can_be_created_with_frameworks(
        self, holder_client: TestClient
    ) -> None:
        response = holder_client.post(
            "/api/passport", json={"frameworks": [ONCOLOGY]}
        )

        assert response.status_code == 201, response.text
        assert [f["id"] for f in response.json()["frameworks"]] == [ONCOLOGY]

    def test_a_passport_created_with_none_has_none(
        self, holder_client: TestClient
    ) -> None:
        response = holder_client.post("/api/passport")

        assert response.json()["frameworks"] == []

    def test_a_holder_changes_their_frameworks(
        self, holder_client: TestClient
    ) -> None:
        passport_id = holder_client.post("/api/passport").json()["passport_id"]

        response = holder_client.put(
            f"/api/passport/{passport_id}/frameworks",
            json={"frameworks": [GENERAL, ONCOLOGY]},
        )

        assert response.status_code == 200, response.text
        assert response.json()["frameworks"] == [
            {"id": GENERAL, "name": "General clinical skills"},
            {"id": ONCOLOGY, "name": "Oncology (proof of concept)"},
        ]
        again = holder_client.get("/api/passport/me").json()
        assert [f["id"] for f in again["passport"]["frameworks"]] == [
            GENERAL,
            ONCOLOGY,
        ]

    def test_an_unknown_framework_is_a_400(
        self, holder_client: TestClient
    ) -> None:
        passport_id = holder_client.post("/api/passport").json()["passport_id"]

        response = holder_client.put(
            f"/api/passport/{passport_id}/frameworks",
            json={"frameworks": ["left_elbow"]},
        )

        assert response.status_code == 400, response.text
        assert "left_elbow" not in response.json()["detail"]

    def test_dropping_a_framework_keeps_what_was_recorded_under_it(
        self, holder_client: TestClient
    ) -> None:
        passport_id = holder_client.post(
            "/api/passport", json={"frameworks": [GENERAL]}
        ).json()["passport_id"]
        holder_client.post(
            f"/api/passport/{passport_id}/logbook/perform_cannulation",
            json={"performed_on": "2026-03-12"},
        )

        holder_client.put(
            f"/api/passport/{passport_id}/frameworks", json={"frameworks": []}
        )

        logbook = holder_client.get(
            f"/api/passport/{passport_id}/logbook/perform_cannulation"
        ).json()
        assert logbook["count"] == 1


class TestOnlyWhatTheFrameworksHold:
    """There is no way round: a competency outside them is refused."""

    @pytest.fixture
    def holder_client(
        self,
        db_session: Session,
        test_client: TestClient,
        passport_store: LocalPassportStore,
    ) -> TestClient:
        holder = _make_user(db_session, "holder", writes=True)
        _organisation(db_session, "Mixed Trust", members=(holder,))
        return _login(test_client, "holder")

    def _passport(self, client: TestClient, *frameworks: str) -> str:
        response = client.post(
            "/api/passport", json={"frameworks": list(frameworks)}
        )
        assert response.status_code == 201, response.text
        return str(response.json()["passport_id"])

    def test_a_competency_in_a_chosen_framework_can_be_logged(
        self, holder_client: TestClient
    ) -> None:
        passport_id = self._passport(holder_client, GENERAL)

        response = holder_client.post(
            f"/api/passport/{passport_id}/logbook/perform_cannulation",
            json={"performed_on": "2026-03-12"},
        )

        assert response.status_code == 201, response.text

    def test_a_competency_outside_them_is_refused_in_plain_words(
        self, holder_client: TestClient
    ) -> None:
        passport_id = self._passport(holder_client, GENERAL)

        response = holder_client.post(
            f"/api/passport/{passport_id}/logbook/prescribe_sact",
            json={"performed_on": "2026-03-12"},
        )

        assert response.status_code == 400, response.text
        detail = response.json()["detail"]
        assert "Settings" in detail
        assert "prescribe_sact" not in detail

    def test_a_holder_with_no_frameworks_can_record_nothing(
        self, holder_client: TestClient
    ) -> None:
        passport_id = self._passport(holder_client)

        response = holder_client.post(
            f"/api/passport/{passport_id}/logbook/perform_cannulation",
            json={"performed_on": "2026-03-12"},
        )

        assert response.status_code == 400, response.text

    def test_every_kind_of_record_is_held_to_it(
        self, holder_client: TestClient
    ) -> None:
        passport_id = self._passport(holder_client, GENERAL)
        base = f"/api/passport/{passport_id}"
        outside = "prescribe_sact"

        attempts = [
            holder_client.post(
                f"{base}/competencies/{outside}/requests",
                json={
                    "assessor_email": "somebody@example.nhs.uk",
                    "observed_on": "2026-03-12",
                    "level_id": "review_and_authorise",
                    "scope_id": "lung",
                },
            ),
            holder_client.post(
                f"{base}/certificates",
                json={
                    "title": "A course",
                    "issuer": "UKONS",
                    "awarded_on": "2026-02-11",
                    "competencies": [outside],
                },
            ),
            holder_client.post(
                f"{base}/cpd",
                json={
                    "activity_on": "2026-02-11",
                    "title": "A study day",
                    "activity_type": "teaching day",
                    "competencies": [outside],
                },
            ),
            holder_client.post(
                f"{base}/reflections",
                json={
                    "title": "A reflection",
                    "written_on": "2026-02-11",
                    "body": "What I learned.",
                    "competencies": [outside],
                    "anonymised_confirmed": True,
                },
            ),
        ]

        assert [r.status_code for r in attempts] == [400, 400, 400, 400]

    def test_amending_a_record_whose_framework_was_dropped_still_works(
        self, holder_client: TestClient
    ) -> None:
        """Dropping a framework freezes nothing recorded under it."""
        passport_id = self._passport(holder_client, GENERAL)
        url = f"/api/passport/{passport_id}/logbook/perform_cannulation"
        stem = holder_client.post(
            url, json={"performed_on": "2026-03-12"}
        ).json()["name"]
        holder_client.put(
            f"/api/passport/{passport_id}/frameworks", json={"frameworks": []}
        )

        response = holder_client.patch(
            f"{url}/{stem}", json={"performed_on": "2026-03-13"}
        )

        assert response.status_code == 200, response.text


def _admin_of(db: Session, org: OrgUnit, username: str = "admin") -> User:
    """Somebody with ``manage_users``, authorised to administer *org*."""
    admin = _make_user(db, username, profession="system_administrator")
    add_org_unit_member(db, org.id, admin.id, "staff")
    administers(db, admin.id, org.id)
    db.commit()
    return admin


def _leads_url(org: OrgUnit) -> str:
    return f"/api/org-units/{org.id}/passport-frameworks"


class TestTheOrganisationRoutes:
    def test_an_admin_sets_the_leads_and_reads_them_back(
        self, db_session: Session, test_client: TestClient
    ) -> None:
        org = _organisation(db_session, "Oncology Department")
        _admin_of(db_session, org)
        client = _login(test_client, "admin")

        put = client.put(_leads_url(org), json={"framework_ids": [ONCOLOGY]})
        got = client.get(_leads_url(org))

        assert put.status_code == 200, put.text
        assert put.json() == {"framework_ids": [ONCOLOGY]}
        assert got.json() == {"framework_ids": [ONCOLOGY]}

    def test_what_an_admin_sets_leads_their_peoples_list(
        self, db_session: Session, test_client: TestClient
    ) -> None:
        holder = _make_user(db_session, "holder")
        org = _organisation(
            db_session, "Oncology Department", members=(holder,)
        )
        _admin_of(db_session, org)
        client = _login(test_client, "admin")

        client.put(_leads_url(org), json={"framework_ids": [ONCOLOGY]})

        assert _ids(db_session, holder)[0] == ONCOLOGY

    def test_a_new_list_replaces_the_old_one(
        self, db_session: Session, test_client: TestClient
    ) -> None:
        org = _organisation(db_session, "Mixed Trust", ONCOLOGY)
        _admin_of(db_session, org)
        client = _login(test_client, "admin")

        response = client.put(
            _leads_url(org), json={"framework_ids": [GENERAL, ONCOLOGY]}
        )

        assert response.json() == {"framework_ids": [GENERAL, ONCOLOGY]}

    def test_an_empty_list_clears_them(
        self, db_session: Session, test_client: TestClient
    ) -> None:
        org = _organisation(db_session, "Mixed Trust", ONCOLOGY)
        _admin_of(db_session, org)
        client = _login(test_client, "admin")

        response = client.put(_leads_url(org), json={"framework_ids": []})

        assert response.json() == {"framework_ids": []}

    def test_an_unknown_framework_is_refused(
        self, db_session: Session, test_client: TestClient
    ) -> None:
        org = _organisation(db_session, "Mixed Trust")
        _admin_of(db_session, org)
        client = _login(test_client, "admin")

        response = client.put(
            _leads_url(org), json={"framework_ids": ["left_elbow"]}
        )

        assert response.status_code == 422, response.text
        assert "left_elbow" not in response.json()["detail"]

    def test_a_framework_is_named_once(
        self, db_session: Session, test_client: TestClient
    ) -> None:
        org = _organisation(db_session, "Mixed Trust")
        _admin_of(db_session, org)
        client = _login(test_client, "admin")

        response = client.put(
            _leads_url(org), json={"framework_ids": [GENERAL, GENERAL]}
        )

        assert response.status_code == 422, response.text

    def test_somebody_without_manage_users_is_refused(
        self, db_session: Session, test_client: TestClient
    ) -> None:
        member = _make_user(db_session, "member")
        org = _organisation(db_session, "Mixed Trust", members=(member,))
        client = _login(test_client, "member")

        assert client.get(_leads_url(org)).status_code == 403
        assert (
            client.put(_leads_url(org), json={"framework_ids": []}).status_code
            == 403
        )
