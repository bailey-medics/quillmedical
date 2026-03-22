"""Tests for teaching router endpoints.

Covers: assessment lifecycle, per-answer scoring, time expiry,
feature gating, pool size edge cases, and educator endpoints.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.features.teaching.models import (
    Assessment,
    AssessmentAnswer,
    QuestionBankConfig,
    QuestionBankItem,
)
from app.models import (
    OrganisationFeature,
    Organization,
    User,
    organisation_staff_member,
)
from app.security import hash_password

# ------------------------------------------------------------------
# Fixtures
# ------------------------------------------------------------------


def _make_teaching_org(db: Session) -> Organization:
    """Create an org with the teaching feature enabled."""
    org = Organization(name="Teaching Org")
    db.add(org)
    db.flush()

    feature = OrganisationFeature(
        organisation_id=org.id,
        feature_key="teaching",
        enabled_by=1,
    )
    db.add(feature)
    db.flush()
    return org


def _make_educator(db: Session, org: Organization) -> User:
    """Create an educator user linked as primary staff."""
    user = User(
        username="testeducator",
        email="educator@test.local",
        password_hash=hash_password("Educator123!"),
        is_active=True,
        base_profession="educator",
        system_permissions="staff",
    )
    db.add(user)
    db.flush()
    db.execute(
        organisation_staff_member.insert().values(
            organisation_id=org.id, user_id=user.id, is_primary=True
        )
    )
    db.flush()
    return user


def _make_learner(db: Session, org: Organization) -> User:
    """Create a learner user linked as primary staff."""
    user = User(
        username="testlearner",
        email="learner@test.local",
        password_hash=hash_password("Learner123!"),
        is_active=True,
        base_profession="learner",
        system_permissions="staff",
    )
    db.add(user)
    db.flush()
    db.execute(
        organisation_staff_member.insert().values(
            organisation_id=org.id, user_id=user.id, is_primary=True
        )
    )
    db.flush()
    return user


SAMPLE_CONFIG_YAML = {
    "id": "test-bank",
    "version": 1,
    "title": "Test Bank",
    "description": "A test question bank.",
    "type": "uniform",
    "images_per_item": 1,
    "image_labels": ["Image"],
    "options": [
        {
            "id": "high_a",
            "label": "High A",
            "tags": ["high_confidence", "adenoma"],
        },
        {
            "id": "low_a",
            "label": "Low A",
            "tags": ["low_confidence", "adenoma"],
        },
        {
            "id": "high_s",
            "label": "High S",
            "tags": ["high_confidence", "serrated"],
        },
        {
            "id": "low_s",
            "label": "Low S",
            "tags": ["low_confidence", "serrated"],
        },
    ],
    "correct_answer_field": "diagnosis",
    "correct_answer_values": ["adenoma", "serrated"],
    "assessment": {
        "items_per_attempt": 3,
        "time_limit_minutes": 60,
        "min_pool_size": 3,
        "randomise_selection": False,
        "randomise_order": False,
        "allow_immediate_retry": True,
        "intro_page": {"title": "Intro", "body": "Start the test."},
        "closing_page": {"title": "Done", "body": "Finished."},
    },
    "pass_criteria": [
        {
            "name": "High confidence rate",
            "description": ">=60% high confidence",
            "rule": "tag_percentage",
            "tag": "high_confidence",
            "threshold": 0.60,
        },
        {
            "name": "High confidence accuracy",
            "description": ">=80% high-confidence correct",
            "rule": "tag_accuracy",
            "tag": "high_confidence",
            "threshold": 0.80,
        },
    ],
    "results": {"certificate_download": False},
}


def _seed_bank(
    db: Session, org_id: int, user_id: int, n_items: int = 3
) -> QuestionBankConfig:
    """Create a question bank config + published items."""
    config = QuestionBankConfig(
        organisation_id=org_id,
        question_bank_id="test-bank",
        version=1,
        title="Test Bank",
        description="A test question bank.",
        type="uniform",
        config_yaml=SAMPLE_CONFIG_YAML,
        synced_by=user_id,
    )
    db.add(config)
    db.flush()

    diagnoses = ["adenoma", "serrated", "adenoma", "serrated", "adenoma"]
    for i in range(n_items):
        item = QuestionBankItem(
            organisation_id=org_id,
            question_bank_id="test-bank",
            bank_version=1,
            status="published",
            images=[{"key": f"image_{i+1}.png"}],
            metadata_json={
                "diagnosis": diagnoses[i % len(diagnoses)],
                "_source_dir": f"question_{i+1}",
            },
            created_by=user_id,
        )
        db.add(item)
    db.commit()
    return config


def _login(client, username: str, password: str) -> dict[str, str]:
    """Login and return CSRF token."""
    resp = client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
    )
    assert resp.status_code == 200
    cookies = resp.cookies
    csrf = cookies.get("XSRF-TOKEN", "")
    return {"X-CSRF-Token": csrf}


# ------------------------------------------------------------------
# Feature gating
# ------------------------------------------------------------------


class TestFeatureGating:
    """Teaching endpoints are gated by the teaching feature."""

    def test_no_feature_returns_403(self, test_client, db_session):
        """User whose org lacks teaching feature gets 403."""
        org = Organization(name="No Feature Org")
        db_session.add(org)
        db_session.flush()

        user = User(
            username="nofeature",
            email="nofeature@test.local",
            password_hash=hash_password("Password123!"),
            is_active=True,
            base_profession="learner",
        )
        db_session.add(user)
        db_session.flush()
        db_session.execute(
            organisation_staff_member.insert().values(
                organisation_id=org.id,
                user_id=user.id,
                is_primary=True,
            )
        )
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={"username": "nofeature", "password": "Password123!"},
        )
        resp = test_client.get("/api/teaching/question-banks")
        assert resp.status_code == 403

    def test_no_primary_org_returns_403(self, test_client, db_session):
        """User not in any org gets 403."""
        user = User(
            username="noorg",
            email="noorg@test.local",
            password_hash=hash_password("Password123!"),
            is_active=True,
            base_profession="learner",
        )
        db_session.add(user)
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={"username": "noorg", "password": "Password123!"},
        )
        resp = test_client.get("/api/teaching/question-banks")
        assert resp.status_code == 403


# ------------------------------------------------------------------
# Question banks
# ------------------------------------------------------------------


class TestQuestionBanks:
    """List and get question bank endpoints."""

    def test_list_empty(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        _make_learner(db_session, org)
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={"username": "testlearner", "password": "Learner123!"},
        )
        resp = test_client.get("/api/teaching/question-banks")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_with_bank(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)

        _make_learner(db_session, org)
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={"username": "testlearner", "password": "Learner123!"},
        )
        resp = test_client.get("/api/teaching/question-banks")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["question_bank_id"] == "test-bank"

    def test_get_bank_detail(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={"username": "testeducator", "password": "Educator123!"},
        )
        resp = test_client.get("/api/teaching/question-banks/test-bank")
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Test Bank"

    def test_get_bank_not_found(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        _make_learner(db_session, org)
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={"username": "testlearner", "password": "Learner123!"},
        )
        resp = test_client.get("/api/teaching/question-banks/nonexistent")
        assert resp.status_code == 404


# ------------------------------------------------------------------
# Assessment lifecycle
# ------------------------------------------------------------------


class TestAssessmentLifecycle:
    """Start → answer → complete flow."""

    def test_start_assessment(self, test_client, db_session):
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
        assert resp.status_code == 200
        data = resp.json()
        assert "assessment" in data
        assert data["assessment"]["total_items"] == 3
        assert data["first_item"] is not None

    def test_pool_too_small(self, test_client, db_session):
        """Cannot start assessment when published items < min_pool_size."""
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        # Only 2 items, but min_pool_size is 3
        _seed_bank(db_session, org.id, educator.id, n_items=2)
        _make_learner(db_session, org)
        db_session.commit()

        headers = _login(test_client, "testlearner", "Learner123!")
        resp = test_client.post(
            "/api/teaching/assessments",
            json={"question_bank_id": "test-bank"},
            headers=headers,
        )
        assert resp.status_code == 409
        assert "Insufficient" in resp.json()["detail"]

    def test_full_lifecycle(self, test_client, db_session):
        """Start → answer all items → complete → verify scoring."""
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        _make_learner(db_session, org)
        db_session.commit()

        headers = _login(test_client, "testlearner", "Learner123!")

        # Start
        resp = test_client.post(
            "/api/teaching/assessments",
            json={"question_bank_id": "test-bank"},
            headers=headers,
        )
        assert resp.status_code == 200
        assessment_id = resp.json()["assessment"]["id"]

        # Answer all 3 items with high_a (high confidence adenoma)
        for i in range(3):
            resp = test_client.post(
                f"/api/teaching/assessments/{assessment_id}/answer",
                json={"selected_option": "high_a"},
                headers=headers,
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["answered"] is True
            if i < 2:
                assert data["all_answered"] is False
            else:
                assert data["all_answered"] is True

        # Complete
        resp = test_client.post(
            f"/api/teaching/assessments/{assessment_id}/complete",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "criteria" in data
        assert "is_passed" in data
        # 3/3 are high confidence (100% >= 60%) ✓
        # But only adenoma items are correct — depends on item diagnoses.

    def test_answer_persists_scoring_fields(self, test_client, db_session):
        """Per-answer scoring: is_correct and resolved_tags set."""
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
        assessment_id = resp.json()["assessment"]["id"]

        # Submit one answer
        test_client.post(
            f"/api/teaching/assessments/{assessment_id}/answer",
            json={"selected_option": "high_a"},
            headers=headers,
        )

        # Check the answer was scored in the DB
        answer = (
            db_session.query(AssessmentAnswer)
            .filter(
                AssessmentAnswer.assessment_id == assessment_id,
                AssessmentAnswer.selected_option == "high_a",
            )
            .first()
        )
        assert answer is not None
        assert answer.is_correct is not None
        assert answer.resolved_tags is not None
        assert "high_confidence" in answer.resolved_tags

    def test_resume_after_disconnect(self, test_client, db_session):
        """GET /current returns next unanswered item."""
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
        assessment_id = resp.json()["assessment"]["id"]

        # Answer first item
        test_client.post(
            f"/api/teaching/assessments/{assessment_id}/answer",
            json={"selected_option": "high_a"},
            headers=headers,
        )

        # Resume — should return second item
        resp = test_client.get(
            f"/api/teaching/assessments/{assessment_id}/current",
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data is not None
        assert data["display_order"] == 2

    def test_complete_already_completed(self, test_client, db_session):
        """Cannot complete an already completed assessment."""
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
        assessment_id = resp.json()["assessment"]["id"]

        # Answer all items
        for _ in range(3):
            test_client.post(
                f"/api/teaching/assessments/{assessment_id}/answer",
                json={"selected_option": "high_a"},
                headers=headers,
            )

        # Complete
        resp = test_client.post(
            f"/api/teaching/assessments/{assessment_id}/complete",
            headers=headers,
        )
        assert resp.status_code == 200

        # Second complete should 409
        resp = test_client.post(
            f"/api/teaching/assessments/{assessment_id}/complete",
            headers=headers,
        )
        assert resp.status_code == 409

    def test_answer_after_time_limit(self, test_client, db_session):
        """Answers rejected after the time limit expires."""
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
        assessment_id = resp.json()["assessment"]["id"]

        # Manually set started_at to 2 hours ago (past the 60-min limit)
        assessment = db_session.get(Assessment, assessment_id)
        assert assessment is not None
        assessment.started_at = datetime.now(UTC) - timedelta(hours=2)
        db_session.commit()

        # Try to answer — should fail with 409
        resp = test_client.post(
            f"/api/teaching/assessments/{assessment_id}/answer",
            json={"selected_option": "high_a"},
            headers=headers,
        )
        assert resp.status_code == 409
        assert "Time limit" in resp.json()["detail"]


# ------------------------------------------------------------------
# Assessment history
# ------------------------------------------------------------------


class TestAssessmentHistory:
    """GET /assessments/history endpoint."""

    def test_empty_history(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        _make_learner(db_session, org)
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={"username": "testlearner", "password": "Learner123!"},
        )
        resp = test_client.get("/api/teaching/assessments/history")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_history_after_assessment(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        _make_learner(db_session, org)
        db_session.commit()

        headers = _login(test_client, "testlearner", "Learner123!")

        # Start an assessment
        test_client.post(
            "/api/teaching/assessments",
            json={"question_bank_id": "test-bank"},
            headers=headers,
        )

        resp = test_client.get("/api/teaching/assessments/history")
        assert resp.status_code == 200
        assert len(resp.json()) == 1


# ------------------------------------------------------------------
# Educator endpoints
# ------------------------------------------------------------------


class TestEducatorEndpoints:
    """Educator-only endpoints (manage_teaching_content competency)."""

    def test_learner_cannot_access_items(self, test_client, db_session):
        """Learner lacks manage_teaching_content → 403."""
        org = _make_teaching_org(db_session)
        _make_learner(db_session, org)
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={"username": "testlearner", "password": "Learner123!"},
        )
        resp = test_client.get("/api/teaching/items")
        assert resp.status_code == 403

    def test_educator_can_list_items(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={"username": "testeducator", "password": "Educator123!"},
        )
        resp = test_client.get("/api/teaching/items")
        assert resp.status_code == 200
        assert len(resp.json()) == 3

    def test_educator_can_list_results(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={"username": "testeducator", "password": "Educator123!"},
        )
        resp = test_client.get("/api/teaching/results")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_educator_can_list_syncs(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        _make_educator(db_session, org)
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={"username": "testeducator", "password": "Educator123!"},
        )
        resp = test_client.get("/api/teaching/syncs")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_educator_update_settings(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        _make_educator(db_session, org)
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.put(
            "/api/teaching/settings",
            json={
                "coordinator_email": "coord@test.local",
                "institution_name": "Test Institution",
            },
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["coordinator_email"] == "coord@test.local"
        assert data["institution_name"] == "Test Institution"
