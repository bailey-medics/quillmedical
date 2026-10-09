"""Every learner route in teaching asks for one of the two competencies.

``view_teaching_results`` is the outer door: reaching teaching, and
somebody's own past results and certificates. ``take_teaching_modules``
is the inner one: entering a module to learn and be assessed. Before
they existed, one competency guarded lessons and video and nothing
guarded assessments at all, so somebody with it taken away could still
sit an exam and download a certificate. See
``docs/docs/plans/2026-10-04-teaching-access-results-modules-and-enrolment-plan.md``.

The first test walks the router, so a learner route added later cannot
be left open by accident. The rest check the doors from outside.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.features.teaching.models import Assessment, QuestionBankConfig
from app.features.teaching.router import (
    MODULES_COMPETENCY,
    RESULTS_COMPETENCY,
    teaching_router,
)
from app.models import OrgUnit, OrgUnitFeature, User
from app.security import hash_password
from tests.competencies import hold
from tests.competencies import join_for_teaching as add_org_unit_member

#: What each learner route must ask for, by method and path.
RESULTS_ROUTES = {
    ("GET", "/teaching/question-banks"),
    ("GET", "/teaching/assessments/history"),
    ("GET", "/teaching/assessments/{assessment_id}"),
    ("GET", "/teaching/assessments/{assessment_id}/question-results"),
    ("GET", "/teaching/assessments/{assessment_id}/certificate"),
}
MODULES_ROUTES = {
    ("GET", "/teaching/question-banks/{bank_id}"),
    ("GET", "/teaching/modules"),
    ("GET", "/teaching/modules/{module_id}/learning"),
    ("POST", "/teaching/modules/{module_id}/video-access"),
    ("POST", "/teaching/assessments"),
    ("GET", "/teaching/assessments/{assessment_id}/current"),
    ("GET", "/teaching/assessments/{assessment_id}/item/{display_order}"),
    ("POST", "/teaching/assessments/{assessment_id}/answer"),
    ("PUT", "/teaching/assessments/{assessment_id}/answer/{answer_id}"),
    ("POST", "/teaching/assessments/{assessment_id}/complete"),
}

#: Every competency a teaching route may be gated on.
GATES = {RESULTS_COMPETENCY, MODULES_COMPETENCY, "manage_teaching"}


def _competencies_asked(route: APIRoute) -> set[str]:
    """The competencies a route's own dependencies check.

    ``has_competency`` returns a closure, so the competency it was made
    with is read from the closure's cells.
    """
    asked: set[str] = set()

    for dependency in route.dependant.dependencies:
        call = dependency.call
        for cell in getattr(call, "__closure__", None) or ():
            if isinstance(cell.cell_contents, str):
                asked.add(cell.cell_contents)

    return asked & GATES


def _routes() -> dict[tuple[str, str], APIRoute]:
    found: dict[tuple[str, str], APIRoute] = {}

    for route in teaching_router.routes:
        assert isinstance(route, APIRoute)
        for method in route.methods:
            found[(method, route.path)] = route

    return found


class TestEveryRouteIsGated:
    def test_no_teaching_route_is_left_without_a_competency(self) -> None:
        """A route with no gate is open to every member by accident."""
        ungated = [
            key
            for key, route in _routes().items()
            if not _competencies_asked(route)
        ]
        assert ungated == []

    @pytest.mark.parametrize("key", sorted(RESULTS_ROUTES))
    def test_results_routes_ask_for_the_results_competency(
        self, key: tuple[str, str]
    ) -> None:
        assert _competencies_asked(_routes()[key]) == {RESULTS_COMPETENCY}

    @pytest.mark.parametrize("key", sorted(MODULES_ROUTES))
    def test_module_routes_ask_for_the_modules_competency(
        self, key: tuple[str, str]
    ) -> None:
        assert _competencies_asked(_routes()[key]) == {MODULES_COMPETENCY}

    def test_every_other_route_asks_for_manage_teaching(self) -> None:
        """Nothing is a learner route that these two lists do not name."""
        for key, route in _routes().items():
            if key in RESULTS_ROUTES or key in MODULES_ROUTES:
                continue
            assert _competencies_asked(route) == {"manage_teaching"}, key


PASSWORD = "Learner123!"  # noqa: S105


def _learner(
    db: Session, org: OrgUnit, name: str, competencies: list[str]
) -> User:
    """A member of a teaching organisation holding exactly *competencies*.

    A consultant, whose profession carries nothing from teaching, so
    what they hold here is only what the test gives them.
    """
    user = User(
        username=name,
        email=f"{name}@test.local",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
    )
    hold(user, *competencies)
    db.add(user)
    db.flush()
    add_org_unit_member(db, org.id, user.id, "trainee")
    db.flush()

    return user


@pytest.fixture
def teaching_org(db_session: Session) -> OrgUnit:
    org = OrgUnit(name="Gate Test Trust", type="organisation")
    db_session.add(org)
    db_session.flush()
    db_session.add(
        OrgUnitFeature(
            org_unit_id=org.id, feature_key="teaching", enabled_by=1
        )
    )
    db_session.flush()

    return org


def _login(client: TestClient, name: str) -> None:
    resp = client.post(
        "/api/auth/login", json={"username": name, "password": PASSWORD}
    )
    assert resp.status_code == 200, resp.text


class TestTheOuterDoor:
    """``view_teaching_results``: teaching itself, and past results."""

    def test_with_neither_competency_nothing_is_reached(
        self, test_client: TestClient, db_session: Session, teaching_org
    ) -> None:
        _learner(db_session, teaching_org, "neither", [])
        db_session.commit()
        _login(test_client, "neither")

        assert test_client.get("/api/teaching/question-banks").status_code == (
            403
        )
        assert (
            test_client.get("/api/teaching/assessments/history").status_code
            == 403
        )

    def test_results_alone_reaches_history(
        self, test_client: TestClient, db_session: Session, teaching_org
    ) -> None:
        _learner(db_session, teaching_org, "results", [RESULTS_COMPETENCY])
        db_session.commit()
        _login(test_client, "results")

        resp = test_client.get("/api/teaching/assessments/history")

        assert resp.status_code == 200

    def test_results_alone_is_told_of_no_module(
        self, test_client: TestClient, db_session: Session, teaching_org
    ) -> None:
        """An empty list, not a refusal: the page is theirs to open."""
        _learner(db_session, teaching_org, "results", [RESULTS_COMPETENCY])
        db_session.commit()
        _login(test_client, "results")

        resp = test_client.get("/api/teaching/question-banks")

        assert resp.status_code == 200
        assert resp.json() == []


class TestTheInnerDoor:
    """``take_teaching_modules``: lessons, video and sitting an exam."""

    def test_results_alone_cannot_enter_a_module(
        self, test_client: TestClient, db_session: Session, teaching_org
    ) -> None:
        _learner(db_session, teaching_org, "results", [RESULTS_COMPETENCY])
        db_session.commit()
        _login(test_client, "results")

        assert (
            test_client.get("/api/teaching/question-banks/any").status_code
            == 403
        )
        assert test_client.get("/api/teaching/modules").status_code == 403
        assert (
            test_client.get("/api/teaching/modules/any/learning").status_code
            == 403
        )

    def test_results_alone_cannot_start_an_assessment(
        self, test_client: TestClient, db_session: Session, teaching_org
    ) -> None:
        """The gap this closes: an exam was open to any member."""
        _learner(db_session, teaching_org, "results", [RESULTS_COMPETENCY])
        db_session.commit()
        _login(test_client, "results")
        csrf = test_client.cookies.get("XSRF-TOKEN") or ""

        resp = test_client.post(
            "/api/teaching/assessments",
            json={"question_bank_id": "any"},
            headers={"X-CSRF-Token": csrf},
        )

        assert resp.status_code == 403

    def test_modules_alone_does_not_open_results(
        self, test_client: TestClient, db_session: Session, teaching_org
    ) -> None:
        """The inner door on its own reaches nothing behind the outer."""
        _learner(db_session, teaching_org, "modules", [MODULES_COMPETENCY])
        db_session.commit()
        _login(test_client, "modules")

        assert (
            test_client.get("/api/teaching/assessments/history").status_code
            == 403
        )

    def test_both_reach_the_module_list(
        self, test_client: TestClient, db_session: Session, teaching_org
    ) -> None:
        _learner(
            db_session,
            teaching_org,
            "both",
            [RESULTS_COMPETENCY, MODULES_COMPETENCY],
        )
        db_session.commit()
        _login(test_client, "both")

        assert test_client.get("/api/teaching/question-banks").status_code == (
            200
        )
        assert test_client.get("/api/teaching/modules").status_code == 200


def _passed_assessment(
    db: Session, org: OrgUnit, user: User, *, certificate: bool
) -> Assessment:
    """A finished, passed attempt at a module whose version is on record."""
    db.add(
        QuestionBankConfig(
            org_unit_id=org.id,
            question_bank_id="gate-bank",
            version=1,
            title="Gate Bank",
            description="A module.",
            type="uniform",
            config_yaml={"results": {"certificate_download": certificate}},
            synced_by=user.id,
        )
    )
    now = datetime.now(UTC)
    assessment = Assessment(
        user_id=user.id,
        org_unit_id=org.id,
        question_bank_id="gate-bank",
        bank_version=1,
        started_at=now,
        completed_at=now,
        time_limit_minutes=30,
        total_items=3,
        is_passed=True,
        score_breakdown={"criteria": []},
    )
    db.add(assessment)
    db.flush()

    return assessment


class TestAResultStandsOnItsOwn:
    """The result page asks for the assessment and nothing else.

    It used to ask for the module as well, for its title and whether a
    pass earns a certificate. The module is behind the modules
    competency, so somebody keeping only their results would have seen a
    result with no title and no way to their certificate.
    """

    def test_results_alone_reads_the_title_and_certificate_flag(
        self, test_client: TestClient, db_session: Session, teaching_org
    ) -> None:
        user = _learner(
            db_session, teaching_org, "results", [RESULTS_COMPETENCY]
        )
        assessment = _passed_assessment(
            db_session, teaching_org, user, certificate=True
        )
        db_session.commit()
        _login(test_client, "results")

        resp = test_client.get(f"/api/teaching/assessments/{assessment.id}")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["bank_title"] == "Gate Bank"
        assert body["certificate_available"] is True

    def test_no_certificate_where_the_module_gives_none(
        self, test_client: TestClient, db_session: Session, teaching_org
    ) -> None:
        user = _learner(
            db_session, teaching_org, "results", [RESULTS_COMPETENCY]
        )
        assessment = _passed_assessment(
            db_session, teaching_org, user, certificate=False
        )
        db_session.commit()
        _login(test_client, "results")

        resp = test_client.get(f"/api/teaching/assessments/{assessment.id}")

        assert resp.json()["certificate_available"] is False

    def test_somebody_else_cannot_read_it(
        self, test_client: TestClient, db_session: Session, teaching_org
    ) -> None:
        owner = _learner(
            db_session, teaching_org, "owner", [RESULTS_COMPETENCY]
        )
        _learner(db_session, teaching_org, "other", [RESULTS_COMPETENCY])
        assessment = _passed_assessment(
            db_session, teaching_org, owner, certificate=True
        )
        db_session.commit()
        _login(test_client, "other")

        resp = test_client.get(f"/api/teaching/assessments/{assessment.id}")

        assert resp.status_code == 404
