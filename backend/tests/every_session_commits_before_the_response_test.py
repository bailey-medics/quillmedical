"""Every route saves its changes before its response goes back.

``get_core_db`` commits after its ``yield``. FastAPI runs that code
before the response is sent only when the dependency is declared with
``scope="function"``; by default it runs after the response, and after
any background task. So a deactivation was saved only once its closure
email had gone, and the users page, asking straight after, read the
account as still active.

The first test walks every route the app serves and finds each use of
the session, through any depth of dependency, so a new route or a new
module-level ``Depends`` cannot slip back to the default. The second
deactivates a user and checks the change was saved by the time the
email's background task began.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.dependencies.models import Dependant
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.core_db import get_core_db
from app.main import app
from app.models import OrgUnit, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from app.users import router as users_router
from app.utils.route_list import served_routes


def _session_scopes(dependant: Dependant) -> list[str | None]:
    """The scope of every use of ``get_core_db`` under *dependant*."""
    scopes: list[str | None] = []

    for dependency in dependant.dependencies:
        if dependency.call is get_core_db:
            scopes.append(dependency.scope)

        scopes.extend(_session_scopes(dependency))

    return scopes


def test_every_route_declares_the_session_with_function_scope() -> None:
    found: dict[str, list[str | None]] = {}

    for served in served_routes(app):
        scopes = _session_scopes(served.dependant)
        if scopes:
            key = f"{sorted(served.methods)} {served.path}"
            found[key] = scopes

    late = {
        key: scopes
        for key, scopes in found.items()
        if any(scope != "function" for scope in scopes)
    }

    # Not vacuous: most routes use the session.
    assert len(found) > 100
    assert late == {}


@pytest.fixture
def colleague(db_session: Session, test_admin: User) -> User:
    """An active user at the admin's own organisation."""
    org = OrgUnit(name="Own Trust", type="organisation")
    db_session.add(org)
    db_session.flush()
    add_org_unit_member(db_session, org.id, test_admin.id, "staff")
    user = User(
        username="colleague",
        email="colleague@example.test",
        password_hash=hash_password("ColleaguePass123!"),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
    )
    db_session.add(user)
    db_session.flush()
    add_org_unit_member(db_session, org.id, user.id, "staff")
    db_session.commit()
    db_session.refresh(user)

    return user


def test_a_deactivation_is_saved_before_its_email_task_runs(
    authenticated_admin_client: TestClient,
    db_session: Session,
    colleague: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The closure email is a background task, which runs after the
    response. By then the deactivation must be committed: the session
    holds no open transaction, so nothing is left unsaved."""
    open_when_emailed: list[bool] = []

    def notice(_db: Session, _user: User) -> object:
        return object()

    def send(_notice: Any) -> None:
        open_when_emailed.append(db_session.in_transaction())

    monkeypatch.setattr(users_router, "closure_notice_for", notice)
    monkeypatch.setattr(users_router, "send_closure_notice", send)
    csrf = authenticated_admin_client.cookies.get("XSRF-TOKEN", "")

    resp = authenticated_admin_client.post(
        f"/api/users/{colleague.id}/deactivate",
        headers={"X-CSRF-Token": csrf},
    )

    assert resp.status_code == 200
    assert open_when_emailed == [False]
