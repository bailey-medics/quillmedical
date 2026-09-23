"""Tests for the dependency that asks *where*, not only *what*.

``has_competency`` compares a competency against somebody's ceiling, which
is true everywhere at once. ``has_competency_at`` adds the second half: a
row in ``practising_competency`` authorising them at the place this request
names. ``test_cbac_scoped.py`` covers the resolver those rows are read
through; these cover the dependency wrapped around it, which is where the
request, the path parameter and the refusal live.

The dependency is mounted on a throwaway app rather than exercised through
a real route. The routes that will carry it do not exist yet, and mounting
it here keeps these tests about the dependency itself: what it reads from
the path, what it does with an operator, and what a refusal looks like.
"""

from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db import get_core_db
from app.deps import get_current_user, has_competency_at
from app.models import OrgUnit, PractisingCompetency, User
from app.security import hash_password
from tests.competencies import withhold

COMPETENCY = "perform_venepuncture"


def _user(
    db: Session,
    username: str,
    *,
    profession: str = "consultant",
    platform_role: str = "standard",
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        platform_role=platform_role,
    )
    db.add(user)
    db.commit()
    return user


def _ward(db: Session, name: str) -> OrgUnit:
    ward = OrgUnit(name=name, type="ward")
    db.add(ward)
    db.commit()
    return ward


def _authorise(
    db: Session, user: User, place: OrgUnit, competency: str = COMPETENCY
) -> None:
    db.add(
        PractisingCompetency(
            user_id=user.id,
            org_unit_id=place.id,
            competency=competency,
        )
    )
    db.commit()


def _client(
    db: Session, user: User, *, place_param: str = "unit_id"
) -> TestClient:
    """An app with one guarded route, standing in for a real one.

    The session and the caller are both overridden, so a test says who is
    asking without going through a login for every case.
    """
    app = FastAPI()

    @app.get(f"/places/{{{place_param}}}/thing")
    def guarded(
        _: User = Depends(has_competency_at(COMPETENCY, place_param)),
    ) -> dict[str, bool]:
        return {"allowed": True}

    @app.get("/no-place")
    def missing_param(
        _: User = Depends(has_competency_at(COMPETENCY, place_param)),
    ) -> dict[str, bool]:
        return {"allowed": True}

    app.dependency_overrides[get_core_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app, raise_server_exceptions=False)


class TestBothHalvesAreRequired:
    """Ceiling and row, and neither one alone."""

    def test_row_and_ceiling_allows(self, db_session: Session) -> None:
        user = _user(db_session, "both")
        ward = _ward(db_session, "Ward A")
        _authorise(db_session, user, ward)

        response = _client(db_session, user).get(f"/places/{ward.id}/thing")

        assert response.status_code == 200

    def test_ceiling_without_a_row_refuses(self, db_session: Session) -> None:
        """Qualified, but not authorised here.

        The consultant profession carries the competency, so this fails
        only because nothing authorises them at this ward. It is the
        suspended surgeon: the qualification is intact and the place has
        withdrawn its permission.
        """
        user = _user(db_session, "no-row")
        ward = _ward(db_session, "Ward B")

        response = _client(db_session, user).get(f"/places/{ward.id}/thing")

        assert response.status_code == 404

    def test_row_without_the_ceiling_refuses(
        self, db_session: Session
    ) -> None:
        """Authorised here, but no longer qualified at all.

        A row beyond somebody's ceiling has no effect, so removing the
        competency from the person narrows every place at once without a
        row being touched.
        """
        user = _user(db_session, "no-ceiling")
        ward = _ward(db_session, "Ward C")
        _authorise(db_session, user, ward)

        withhold(user, COMPETENCY)
        db_session.commit()

        response = _client(db_session, user).get(f"/places/{ward.id}/thing")

        assert response.status_code == 404

    def test_a_row_elsewhere_does_not_carry(self, db_session: Session) -> None:
        """Authorised at one ward is not authorised at another.

        The case the whole model exists for: the same person, the same
        competency, allowed here and refused there.
        """
        user = _user(db_session, "one-ward")
        allowed = _ward(db_session, "Ward D")
        refused = _ward(db_session, "Ward E")
        _authorise(db_session, user, allowed)

        client = _client(db_session, user)

        assert client.get(f"/places/{allowed.id}/thing").status_code == 200
        assert client.get(f"/places/{refused.id}/thing").status_code == 404


class TestOperators:
    """Operating Quill is true everywhere or nowhere."""

    def test_an_operator_needs_no_row(self, db_session: Session) -> None:
        """An operator holds no rows anywhere, so checking would lock them out."""
        operator = _user(db_session, "operator", platform_role="superadmin")
        ward = _ward(db_session, "Ward F")

        response = _client(db_session, operator).get(
            f"/places/{ward.id}/thing"
        )

        assert response.status_code == 200

    def test_an_operator_passes_without_the_ceiling(
        self, db_session: Session
    ) -> None:
        """The bypass is whole, not a shortcut past the row only."""
        operator = _user(
            db_session,
            "operator-patient",
            profession="patient",
            platform_role="superadmin",
        )
        ward = _ward(db_session, "Ward G")

        response = _client(db_session, operator).get(
            f"/places/{ward.id}/thing"
        )

        assert response.status_code == 200


class TestWhatARefusalSays:
    """A refusal must not teach the caller anything."""

    def test_an_unknown_place_is_a_404_not_a_500(
        self, db_session: Session
    ) -> None:
        user = _user(db_session, "unknown-place")

        response = _client(db_session, user).get("/places/999999/thing")

        assert response.status_code == 404

    def test_a_place_that_is_not_a_number_is_a_404(
        self, db_session: Session
    ) -> None:
        """Refused rather than raised, so a stray path cannot 500."""
        user = _user(db_session, "silly-place")

        response = _client(db_session, user).get("/places/not-a-number/thing")

        assert response.status_code == 404

    def test_the_detail_names_neither_the_place_nor_the_competency(
        self, db_session: Session
    ) -> None:
        """404 over 403, and nothing in the body to work backwards from.

        Saying "you lack perform_venepuncture here" would confirm the ward
        exists and name what is practised there.
        """
        user = _user(db_session, "quiet-refusal")
        ward = _ward(db_session, "Ward H")

        response = _client(db_session, user).get(f"/places/{ward.id}/thing")

        assert response.status_code == 404
        detail = response.json()["detail"]
        assert COMPETENCY not in detail
        assert "Ward H" not in detail


class TestWiring:
    """Mistakes in the route, rather than in the caller."""

    def test_a_missing_path_parameter_is_a_500(
        self, db_session: Session
    ) -> None:
        """A mis-wired route is a bug here, not a refusal.

        404 would hide it behind a plausible-looking answer, and the route
        would go on refusing everybody for as long as nobody looked.
        """
        user = _user(db_session, "mis-wired")

        response = _client(db_session, user).get("/no-place")

        assert response.status_code == 500

    def test_the_place_parameter_can_be_named(
        self, db_session: Session
    ) -> None:
        """Not every route will call it ``unit_id``."""
        user = _user(db_session, "named-param")
        ward = _ward(db_session, "Ward I")
        _authorise(db_session, user, ward)

        client = _client(db_session, user, place_param="site_id")

        assert client.get(f"/places/{ward.id}/thing").status_code == 200


@pytest.mark.parametrize("platform_role", ["standard", "superadmin"])
def test_the_dependency_returns_the_caller(
    db_session: Session, platform_role: str
) -> None:
    """Both paths hand back the user, so a route can annotate on it."""
    user = _user(
        db_session, f"returns-{platform_role}", platform_role=platform_role
    )
    ward = _ward(db_session, f"Ward {platform_role}")
    _authorise(db_session, user, ward)

    response = _client(db_session, user).get(f"/places/{ward.id}/thing")

    assert response.status_code == 200
    assert response.json() == {"allowed": True}
