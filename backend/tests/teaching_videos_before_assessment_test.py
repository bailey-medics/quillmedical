"""A module that asks for its videos to be played keeps its assessment shut.

``POST /api/teaching/assessments`` refuses to start an attempt on a
module whose ``module.yaml`` sets ``playVideosBeforeAssessment`` until
the delegate has pressed play on every learning video, and
``GET /api/teaching/question-banks`` names the videos still to play, so
the module page can say why the assessment is locked. The rules behind
both are ``videos_to_play``, tested in
``app/features/teaching/video_plays_test.py``.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.features.teaching import media
from app.features.teaching.models import QuestionBankConfig
from app.features.teaching.video_plays import record_play
from app.models import OrgUnit, OrgUnitFeature
from tests.teaching_starting_an_attempt_test import (
    ASSESSMENTS,
    BANK,
    START,
    _attempt,
    _attempts_of,
    _learner,
    _serve,
    _signed_in,
)

BANKS = "/api/teaching/question-banks"
VIDEOS = ["video-1", "video-2", "video-3"]
LOCKED = {"detail": "Complete the learning section first"}


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    """An organisation with teaching on, serving nothing yet."""
    org = OrgUnit(name="Video Test Trust", type="organisation")
    db_session.add(org)
    db_session.flush()
    db_session.add(
        OrgUnitFeature(
            org_unit_id=org.id, feature_key="teaching", enabled_by=1
        )
    )
    db_session.flush()

    return org


@pytest.fixture(autouse=True)
def three_videos(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        media, "get_referenced_media_keys", lambda _module_id: list(VIDEOS)
    )


@pytest.fixture(autouse=True)
def servable(monkeypatch: pytest.MonkeyPatch) -> None:
    """Every module's media is complete, so the list shows it."""
    monkeypatch.setattr(
        "app.features.teaching.listing.module_is_servable",
        lambda _db, _org_id, _module_id: True,
    )


def _ask_for_plays(db: Session) -> None:
    db.execute(
        update(QuestionBankConfig)
        .where(QuestionBankConfig.question_bank_id == BANK)
        .values(play_videos_before_assessment=True)
    )
    db.commit()


def _row(client: TestClient) -> dict[str, object]:
    resp = client.get(BANKS)
    assert resp.status_code == 200, resp.text
    (row,) = [r for r in resp.json() if r["question_bank_id"] == BANK]

    return row


def test_starting_is_refused_until_every_video_is_played(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(db_session, trust)
    _ask_for_plays(db_session)
    user = _learner(db_session, trust)
    client, headers = _signed_in(test_client)
    record_play(db_session, user.id, BANK, "video-1")
    record_play(db_session, user.id, BANK, "video-2")
    db_session.commit()

    resp = client.post(ASSESSMENTS, json=START, headers=headers)

    assert resp.status_code == 403
    assert resp.json() == LOCKED
    assert _attempts_of(db_session, user) == []


def test_starting_is_allowed_once_every_video_is_played(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(db_session, trust)
    _ask_for_plays(db_session)
    user = _learner(db_session, trust)
    client, headers = _signed_in(test_client)

    for key in VIDEOS:
        record_play(db_session, user.id, BANK, key)

    db_session.commit()

    resp = client.post(ASSESSMENTS, json=START, headers=headers)

    assert resp.status_code == 200, resp.text
    assert len(_attempts_of(db_session, user)) == 1


def test_an_attempt_under_way_is_handed_back_without_asking(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    items = _serve(db_session, trust)
    user = _learner(db_session, trust)
    under_way = _attempt(db_session, trust, user, items)
    _ask_for_plays(db_session)
    client, headers = _signed_in(test_client)

    resp = client.post(ASSESSMENTS, json=START, headers=headers)

    assert resp.status_code == 200, resp.text
    assert resp.json()["assessment"]["id"] == under_way.id


def test_a_module_that_does_not_ask_is_never_refused(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(db_session, trust)
    user = _learner(db_session, trust)
    client, headers = _signed_in(test_client)

    resp = client.post(ASSESSMENTS, json=START, headers=headers)

    assert resp.status_code == 200, resp.text
    assert len(_attempts_of(db_session, user)) == 1


def test_the_list_names_the_videos_still_to_play(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(db_session, trust)
    _ask_for_plays(db_session)
    user = _learner(db_session, trust)
    client, _ = _signed_in(test_client)
    record_play(db_session, user.id, BANK, "video-2")
    db_session.commit()

    row = _row(client)

    assert row["videos_to_play"] == ["video-1", "video-3"]


def test_the_list_names_none_once_every_video_is_played(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(db_session, trust)
    _ask_for_plays(db_session)
    user = _learner(db_session, trust)
    client, _ = _signed_in(test_client)

    for key in VIDEOS:
        record_play(db_session, user.id, BANK, key)

    db_session.commit()

    assert _row(client)["videos_to_play"] == []


def test_the_list_names_none_on_a_module_that_does_not_ask(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(db_session, trust)
    _learner(db_session, trust)
    client, _ = _signed_in(test_client)

    assert _row(client)["videos_to_play"] == []
