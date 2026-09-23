"""An answer's resolved tags are written as rows beside the JSON.

``assessment_answers.resolved_tags`` copies the tags of the option a
candidate chose. These pin that ``assessment_answer_tag`` holds the same
copy, one row per tag, whenever an answer is given or changed, so the
change that moves scoring onto the rows reads exactly what the JSON held.

See ``docs/docs/plans/2026-09-23-resolved-tags-plan.md``.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.features.teaching.models import AssessmentAnswer
from tests.test_teaching_router import (
    _login,
    _make_educator,
    _make_learner,
    _make_teaching_org,
    _seed_bank,
)


def _start(
    test_client: TestClient, db_session: Session
) -> tuple[int, dict[str, str]]:
    org = _make_teaching_org(db_session)
    educator = _make_educator(db_session, org)
    _seed_bank(db_session, org.id, educator.id)
    _make_learner(db_session, org)
    db_session.commit()
    headers = _login(test_client, "testlearner", "Learner123!")
    resp = test_client.post(
        "/api/teaching/assessments",
        json={"question_bank_id": "test-bank"},
        headers=headers,
    )
    assert resp.is_success, resp.text
    return resp.json()["assessment"]["id"], headers


def _answered(db_session: Session, assessment_id: int) -> AssessmentAnswer:
    db_session.expire_all()
    answer = (
        db_session.query(AssessmentAnswer)
        .filter(
            AssessmentAnswer.assessment_id == assessment_id,
            AssessmentAnswer.selected_option.is_not(None),
        )
        .one()
    )
    return answer


class TestTheRowsFollowTheAnswer:
    def test_answering_writes_a_row_per_tag(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        assessment_id, headers = _start(test_client, db_session)

        resp = test_client.post(
            f"/api/teaching/assessments/{assessment_id}/answer",
            json={"selected_option": "high_a"},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

        answer = _answered(db_session, assessment_id)
        assert sorted(row.tag for row in answer.tags) == [
            "adenoma",
            "high_confidence",
        ]
        # The same snapshot the JSON holds, which scoring still reads.
        assert sorted(row.tag for row in answer.tags) == sorted(
            answer.resolved_tags or []
        )

    def test_changing_the_answer_replaces_the_rows(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """Until the assessment is completed, the answer is being edited."""
        assessment_id, headers = _start(test_client, db_session)
        test_client.post(
            f"/api/teaching/assessments/{assessment_id}/answer",
            json={"selected_option": "high_a"},
            headers=headers,
        )
        answer = _answered(db_session, assessment_id)
        kept_id = next(r.id for r in answer.tags if r.tag == "high_confidence")

        resp = test_client.put(
            f"/api/teaching/assessments/{assessment_id}/answer/{answer.id}",
            json={"selected_option": "high_s"},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

        answer = _answered(db_session, assessment_id)
        assert sorted(row.tag for row in answer.tags) == [
            "high_confidence",
            "serrated",
        ]
        # The tag both options share is the same row, not a fresh copy.
        assert [r.id for r in answer.tags if r.tag == "high_confidence"] == [
            kept_id
        ]


class TestSetTags:
    def test_it_keeps_what_stays_and_swaps_the_rest(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        assessment_id, _headers = _start(test_client, db_session)
        answer = (
            db_session.query(AssessmentAnswer)
            .filter(AssessmentAnswer.assessment_id == assessment_id)
            .first()
        )
        assert answer is not None

        answer.set_tags(["a", "b"])
        db_session.commit()
        answer.set_tags(["b", "c", "c"])
        db_session.commit()

        db_session.refresh(answer)
        assert sorted(row.tag for row in answer.tags) == ["b", "c"]


class TestScoringReadsTheRows:
    def test_completing_scores_the_rows_not_the_json(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """The column is still written, and read by nothing.

        Every answer here is high confidence in its rows. Their JSON is
        overwritten to say otherwise, and the result still counts them as
        high confidence, so the result came from the rows.
        """
        assessment_id, headers = _start(test_client, db_session)
        for _ in range(3):
            resp = test_client.post(
                f"/api/teaching/assessments/{assessment_id}/answer",
                json={"selected_option": "high_a"},
                headers=headers,
            )
            assert resp.status_code == 200, resp.text
        for answer in db_session.query(AssessmentAnswer).filter(
            AssessmentAnswer.assessment_id == assessment_id
        ):
            answer.resolved_tags = ["low_confidence"]
        db_session.commit()

        resp = test_client.post(
            f"/api/teaching/assessments/{assessment_id}/complete",
            headers=headers,
        )

        assert resp.status_code == 200, resp.text
        rate = next(
            c
            for c in resp.json()["criteria"]
            if c["name"] == "High confidence rate"
        )
        assert rate["value"] == 1.0
