"""``POST /modules/{module_id}/videos/{media_key}/plays``, by route.

A delegate's browser posts here each time play is first pressed on a
learning video. The route records it only for a module whose
``module.yaml`` sets ``playVideosBeforeAssessment``; ``videos_to_play``
then works out what is left. These tests say what the caller is told
and what is kept.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.teaching import media
from app.features.teaching.models import (
    ModuleVideoPlay,
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.models import OrgUnit, OrgUnitFeature, User
from app.security import hash_password
from tests.competencies import join_for_teaching

MODULE = "polyps"
PASSWORD = "Password123!"  # noqa: S105
VIDEOS = ["video-1", "video-2", "video-3"]


def _plays_url(media_key: str, module_id: str = MODULE) -> str:
    return f"/api/teaching/modules/{module_id}/videos/{media_key}/plays"


@pytest.fixture(autouse=True)
def three_videos(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        media, "get_referenced_media_keys", lambda _module_id: list(VIDEOS)
    )


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


def _serve(db: Session, org: OrgUnit, *, asks: bool) -> None:
    """Have *org* serve the module, asking for plays or not."""
    db.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=MODULE,
            is_live=True,
            active_version=1,
        )
    )
    db.add(
        QuestionBankConfig(
            org_unit_id=org.id,
            question_bank_id=MODULE,
            version=1,
            title="Polyps",
            description="A question bank.",
            type="uniform",
            config_yaml={"id": MODULE},
            play_videos_before_assessment=asks,
        )
    )
    db.flush()


def _learner(db: Session, org: OrgUnit) -> User:
    """A delegate with a place at *org*, enrolled on what it serves now."""
    user = User(
        username="learner",
        email="learner@test.local",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession="teaching_delegate",
    )
    db.add(user)
    db.flush()
    join_for_teaching(db, org.id, user.id, "trainee")
    db.commit()

    return user


def _login(client: TestClient, user: User) -> dict[str, str]:
    """Sign in, and give the header a route that changes something needs."""
    response = client.post(
        "/api/auth/login",
        json={"username": user.username, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text

    return {"X-CSRF-Token": client.cookies.get("XSRF-TOKEN", "")}


def _plays(db: Session) -> list[tuple[int, str, str]]:
    rows = db.scalars(select(ModuleVideoPlay)).all()

    return [(row.user_id, row.question_bank_id, row.media_key) for row in rows]


def test_a_play_is_recorded_on_a_module_that_asks(
    test_client: TestClient, db_session: Session
) -> None:
    org = _teaching_org(db_session, "Our Trust")
    _serve(db_session, org, asks=True)
    user = _learner(db_session, org)
    headers = _login(test_client, user)

    response = test_client.post(_plays_url("video-2"), headers=headers)

    assert response.status_code == 204
    assert _plays(db_session) == [(user.id, MODULE, "video-2")]


def test_a_play_on_a_module_that_does_not_ask_is_not_kept(
    test_client: TestClient, db_session: Session
) -> None:
    org = _teaching_org(db_session, "Our Trust")
    _serve(db_session, org, asks=False)
    user = _learner(db_session, org)
    headers = _login(test_client, user)

    response = test_client.post(_plays_url("video-2"), headers=headers)

    assert response.status_code == 204
    assert _plays(db_session) == []


def test_a_video_the_module_does_not_name_is_not_found(
    test_client: TestClient, db_session: Session
) -> None:
    org = _teaching_org(db_session, "Our Trust")
    _serve(db_session, org, asks=True)
    user = _learner(db_session, org)
    headers = _login(test_client, user)

    response = test_client.post(_plays_url("video-9"), headers=headers)

    assert response.status_code == 404
    assert response.json() == {"detail": "Video not found"}
    assert _plays(db_session) == []


def test_a_module_the_delegate_cannot_open_is_not_found(
    test_client: TestClient, db_session: Session
) -> None:
    org = _teaching_org(db_session, "Our Trust")
    other = _teaching_org(db_session, "Another Trust")
    _serve(db_session, other, asks=True)
    user = _learner(db_session, org)
    headers = _login(test_client, user)

    response = test_client.post(_plays_url("video-1"), headers=headers)

    assert response.status_code == 404
    assert response.json() == {"detail": "Module not found"}
    assert _plays(db_session) == []


def test_a_play_without_the_csrf_header_is_refused(
    test_client: TestClient, db_session: Session
) -> None:
    org = _teaching_org(db_session, "Our Trust")
    _serve(db_session, org, asks=True)
    user = _learner(db_session, org)
    _login(test_client, user)

    response = test_client.post(_plays_url("video-1"))

    assert response.status_code == 403
    assert _plays(db_session) == []
