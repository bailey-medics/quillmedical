"""Tests for teaching router endpoints.

Covers: assessment lifecycle, per-answer scoring, time expiry,
feature gating, pool size edge cases, and educator endpoints.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.features.teaching.models import (
    Assessment,
    AssessmentAnswer,
    ModuleMediaLink,
    QuestionBankConfig,
    QuestionBankItem,
    QuestionBankOrgStatus,
)
from app.features.teaching.router import resolve_visible_module
from app.models import (
    Organisation,
    OrganisationFeature,
    Site,
    User,
    organisation_member,
    organisation_site,
    site_member,
)
from app.security import hash_password

# ------------------------------------------------------------------
# Fixtures
# ------------------------------------------------------------------


def _make_teaching_org(db: Session) -> Organisation:
    """Create an org with the teaching feature enabled."""
    org = Organisation(name="Teaching Org")
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


def _make_educator(db: Session, org: Organisation) -> User:
    """Create an educator user linked as staff."""
    user = User(
        username="testeducator",
        email="educator@test.local",
        password_hash=hash_password("Educator123!"),
        is_active=True,
        email_verified=True,
        base_profession="teaching_admin",
        system_permissions="admin",
    )
    db.add(user)
    db.flush()
    db.execute(
        organisation_member.insert().values(
            organisation_id=org.id, user_id=user.id
        )
    )
    db.flush()
    return user


def _make_learner(db: Session, org: Organisation) -> User:
    """Create a learner user linked as staff."""
    user = User(
        username="testlearner",
        email="learner@test.local",
        password_hash=hash_password("Learner123!"),
        is_active=True,
        email_verified=True,
        base_profession="teaching_delegate",
        system_permissions="staff",
    )
    db.add(user)
    db.flush()
    db.execute(
        organisation_member.insert().values(
            organisation_id=org.id, user_id=user.id
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
    db: Session,
    org_id: int,
    user_id: int,
    n_items: int = 3,
    is_live: bool = True,
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

    # Set the bank as live (or closed) for the org, pinned to the version
    # above. A real status row always carries a pointer — the settings
    # endpoint sets one when it creates the row — and candidate queries now
    # follow it, so a fixture without one would not represent a live bank.
    db.add(
        QuestionBankOrgStatus(
            organisation_id=org_id,
            question_bank_id="test-bank",
            is_live=is_live,
            active_version=1,
        )
    )

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
        org = Organisation(name="No Feature Org")
        db_session.add(org)
        db_session.flush()

        user = User(
            username="nofeature",
            email="nofeature@test.local",
            password_hash=hash_password("Password123!"),
            is_active=True,
            email_verified=True,
            base_profession="teaching_delegate",
        )
        db_session.add(user)
        db_session.flush()
        db_session.execute(
            organisation_member.insert().values(
                organisation_id=org.id,
                user_id=user.id,
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
            email_verified=True,
            base_profession="teaching_delegate",
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

    def test_closed_bank_returns_403(self, test_client, db_session):
        """Cannot start assessment when bank is not live."""
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id, is_live=False)
        _make_learner(db_session, org)
        db_session.commit()

        headers = _login(test_client, "testlearner", "Learner123!")
        resp = test_client.post(
            "/api/teaching/assessments",
            json={"question_bank_id": "test-bank"},
            headers=headers,
        )
        assert resp.status_code == 403
        assert "not currently open" in resp.json()["detail"]

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
# Certificate download
# ------------------------------------------------------------------


class TestDownloadCertificate:
    """GET /assessments/{id}/certificate endpoint."""

    def test_requires_auth(self, test_client):
        resp = test_client.get(
            "/api/teaching/assessments/1/certificate",
        )
        assert resp.status_code == 401

    def test_nonexistent_assessment_returns_404(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        _make_learner(db_session, org)
        db_session.commit()

        headers = _login(test_client, "testlearner", "Learner123!")

        resp = test_client.get(
            "/api/teaching/assessments/999999/certificate",
            headers=headers,
        )
        assert resp.status_code == 404
        assert "Assessment not found" in resp.json()["detail"]

    def test_incomplete_assessment_returns_400(self, test_client, db_session):
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

        resp = test_client.get(
            f"/api/teaching/assessments/{assessment_id}/certificate",
            headers=headers,
        )
        assert resp.status_code == 400
        assert "passed assessments" in resp.json()["detail"]


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


# ------------------------------------------------------------------
# _resolve_bank_path security
# ------------------------------------------------------------------


class TestResolveBankPath:
    """Ensure _resolve_bank_path rejects path traversal."""

    def test_rejects_path_traversal(self):
        import pytest
        from fastapi import HTTPException

        from app.features.teaching.router import _resolve_bank_path

        with pytest.raises(HTTPException) as exc:
            _resolve_bank_path("../etc/passwd")
        assert exc.value.status_code == 400

    def test_rejects_slash(self):
        import pytest
        from fastapi import HTTPException

        from app.features.teaching.router import _resolve_bank_path

        with pytest.raises(HTTPException) as exc:
            _resolve_bank_path("some/nested/path")
        assert exc.value.status_code == 400

    def test_rejects_empty(self):
        import pytest
        from fastapi import HTTPException

        from app.features.teaching.router import _resolve_bank_path

        with pytest.raises(HTTPException) as exc:
            _resolve_bank_path("")
        assert exc.value.status_code == 400

    def test_missing_config_raises_400(self, monkeypatch):
        import pytest
        from fastapi import HTTPException

        from app.features.teaching.router import _resolve_bank_path

        monkeypatch.setattr(
            "app.config.settings.TEACHING_QUESTION_BANK_PATH", None
        )
        with pytest.raises(HTTPException) as exc:
            _resolve_bank_path("valid-bank-id")
        assert exc.value.status_code == 400

    def test_nonexistent_bank_raises_404(self, monkeypatch, tmp_path):
        import pytest
        from fastapi import HTTPException

        from app.features.teaching.router import _resolve_bank_path

        monkeypatch.setattr(
            "app.config.settings.TEACHING_QUESTION_BANK_PATH",
            str(tmp_path),
        )
        with pytest.raises(HTTPException) as exc:
            _resolve_bank_path("no-such-bank")
        assert exc.value.status_code == 404

    def test_valid_bank_returns_path(self, monkeypatch, tmp_path):
        from app.features.teaching.router import _resolve_bank_path

        bank_dir = tmp_path / "my-bank"
        bank_dir.mkdir()
        (bank_dir / "config.yaml").touch()

        monkeypatch.setattr(
            "app.config.settings.TEACHING_QUESTION_BANK_PATH",
            str(tmp_path),
        )
        result = _resolve_bank_path("my-bank")
        assert result == bank_dir


# ------------------------------------------------------------------
# _resolve_bank_path_or_gcs
# ------------------------------------------------------------------


class TestResolveBankPathOrGcs:
    """Tests for the GCS-aware bank path resolver."""

    def test_invalid_bank_id_raises_400(self):
        import pytest
        from fastapi import HTTPException

        from app.features.teaching.router import _resolve_bank_path_or_gcs

        with pytest.raises(HTTPException) as exc:
            _resolve_bank_path_or_gcs("../evil")
        assert exc.value.status_code == 400

    def test_prefers_local_path(self, monkeypatch, tmp_path):
        from app.features.teaching.router import _resolve_bank_path_or_gcs

        bank_dir = tmp_path / "my-bank"
        bank_dir.mkdir()
        (bank_dir / "config.yaml").touch()

        monkeypatch.setattr(
            "app.config.settings.TEACHING_QUESTION_BANK_PATH",
            str(tmp_path),
        )
        monkeypatch.setattr(
            "app.config.settings.TEACHING_GCS_BUCKET",
            "some-bucket",
        )
        result, is_temp = _resolve_bank_path_or_gcs("my-bank")
        assert result == bank_dir
        assert is_temp is False

    def test_falls_back_to_gcs(self, monkeypatch, tmp_path):
        from unittest.mock import patch

        from app.features.teaching.router import _resolve_bank_path_or_gcs

        monkeypatch.setattr(
            "app.config.settings.TEACHING_QUESTION_BANK_PATH",
            None,
        )
        monkeypatch.setattr(
            "app.config.settings.TEACHING_GCS_BUCKET",
            "test-bucket",
        )

        fake_dir = tmp_path / "downloaded" / "test-bank"
        fake_dir.mkdir(parents=True)

        with patch(
            "app.features.teaching.router.download_bank_from_gcs",
            return_value=fake_dir,
        ):
            result, is_temp = _resolve_bank_path_or_gcs("test-bank")
            assert result == fake_dir
            assert is_temp is True

    def test_no_config_raises_400(self, monkeypatch):
        import pytest
        from fastapi import HTTPException

        from app.features.teaching.router import _resolve_bank_path_or_gcs

        monkeypatch.setattr(
            "app.config.settings.TEACHING_QUESTION_BANK_PATH",
            None,
        )
        monkeypatch.setattr(
            "app.config.settings.TEACHING_GCS_BUCKET",
            None,
        )
        with pytest.raises(HTTPException) as exc:
            _resolve_bank_path_or_gcs("some-bank")
        assert exc.value.status_code == 400


# ------------------------------------------------------------------
# Admin banks endpoint
# ------------------------------------------------------------------


class TestPromotingAVersion:
    """Moving the pointer is what makes the rest of this usable.

    Without it a bank is pinned at whatever version it went live on, and a
    revision can be imported but never reach anyone.
    """

    def _url(self, org_id: int) -> str:
        return (
            f"/api/teaching/admin/banks/test-bank"
            f"/organisations/{org_id}/active-version"
        )

    def _with_two_versions(self, db_session, org, educator) -> None:
        _seed_bank(db_session, org.id, educator.id)
        db_session.add(
            QuestionBankConfig(
                organisation_id=org.id,
                question_bank_id="test-bank",
                version=2,
                title="Test Bank",
                description="A revision.",
                type="uniform",
                config_yaml=SAMPLE_CONFIG_YAML,
                synced_by=educator.id,
            )
        )
        db_session.commit()

    def _status(self, db_session, org):
        return (
            db_session.query(QuestionBankOrgStatus)
            .filter_by(organisation_id=org.id, question_bank_id="test-bank")
            .one()
        )

    def test_it_moves_the_pointer_forward(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        self._with_two_versions(db_session, org, educator)

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.put(
            self._url(org.id), headers=headers, json={"version": 2}
        )

        assert resp.status_code == 200
        assert resp.json()["active_version"] == 2
        assert resp.json()["previous_version"] == 1
        assert self._status(db_session, org).active_version == 2

    def test_rolling_back_is_the_same_operation(self, test_client, db_session):
        """Naming an earlier version, not a separate endpoint."""
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        self._with_two_versions(db_session, org, educator)

        headers = _login(test_client, "testeducator", "Educator123!")
        test_client.put(
            self._url(org.id), headers=headers, json={"version": 2}
        )
        resp = test_client.put(
            self._url(org.id), headers=headers, json={"version": 1}
        )

        assert resp.status_code == 200
        assert self._status(db_session, org).active_version == 1

    def test_it_records_who_moved_it_and_when(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        self._with_two_versions(db_session, org, educator)

        headers = _login(test_client, "testeducator", "Educator123!")
        test_client.put(
            self._url(org.id), headers=headers, json={"version": 2}
        )

        row = self._status(db_session, org)
        assert row.active_version_set_by == educator.id
        assert row.active_version_set_at is not None

    def test_a_version_that_does_not_exist_is_refused(
        self, test_client, db_session
    ):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        self._with_two_versions(db_session, org, educator)

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.put(
            self._url(org.id), headers=headers, json={"version": 9}
        )

        assert resp.status_code == 404
        assert self._status(db_session, org).active_version == 1

    def test_another_organisations_version_is_not_promotable(
        self, test_client, db_session
    ):
        """Content is shared; a version another organisation synced is not
        one this organisation can serve."""
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        other = Organisation(name="Other Org")
        db_session.add(other)
        db_session.flush()
        db_session.add(
            QuestionBankConfig(
                organisation_id=other.id,
                question_bank_id="test-bank",
                version=5,
                title="Test Bank",
                description="Theirs, not ours.",
                type="uniform",
                config_yaml=SAMPLE_CONFIG_YAML,
                synced_by=educator.id,
            )
        )
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.put(
            self._url(org.id), headers=headers, json={"version": 5}
        )

        assert resp.status_code == 404

    def test_a_bank_not_set_up_here_is_refused(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        db_session.query(QuestionBankOrgStatus).delete()
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.put(
            self._url(org.id), headers=headers, json={"version": 1}
        )

        assert resp.status_code == 404

    def test_version_zero_is_rejected_by_validation(
        self, test_client, db_session
    ):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        self._with_two_versions(db_session, org, educator)

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.put(
            self._url(org.id), headers=headers, json={"version": 0}
        )

        assert resp.status_code == 422

    def test_promoting_for_an_organisation_you_are_not_in_is_refused(
        self, test_client, db_session
    ):
        """Why the organisation is named rather than inferred.

        Inferring it took the caller's first organisation, so someone
        teaching for two would silently promote for whichever came back
        first — and never know which.
        """
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        self._with_two_versions(db_session, org, educator)
        other = Organisation(name="Not Mine")
        db_session.add(other)
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.put(
            self._url(other.id), headers=headers, json={"version": 2}
        )

        assert resp.status_code == 403
        assert self._status(db_session, org).active_version == 1

    def test_a_learner_cannot_promote(self, test_client, db_session):
        """Gated on manage_teaching_content like every other admin route."""
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        self._with_two_versions(db_session, org, educator)
        _make_learner(db_session, org)
        db_session.commit()

        headers = _login(test_client, "testlearner", "Learner123!")
        resp = test_client.put(
            self._url(org.id), headers=headers, json={"version": 2}
        )

        assert resp.status_code == 403

    def test_candidates_get_the_promoted_version_afterwards(
        self, test_client, db_session
    ):
        """End to end: promotion is what actually changes what is served."""
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        self._with_two_versions(db_session, org, educator)

        headers = _login(test_client, "testeducator", "Educator123!")
        test_client.put(
            self._url(org.id), headers=headers, json={"version": 2}
        )
        resp = test_client.get(
            "/api/teaching/question-banks/test-bank", headers=headers
        )

        assert resp.json()["version"] == 2


class TestAdminViewsShowBothVersions:
    """An admin needs to see that a revision is waiting.

    Candidates get the promoted version; the admin screens are where the gap
    between that and the newest import has to be visible, or nobody knows
    there is anything to promote.
    """

    def test_the_list_reports_both(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        db_session.add(
            QuestionBankConfig(
                organisation_id=org.id,
                question_bank_id="test-bank",
                version=2,
                title="Test Bank",
                description="Waiting to be promoted.",
                type="uniform",
                config_yaml=SAMPLE_CONFIG_YAML,
                synced_by=educator.id,
            )
        )
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.get("/api/teaching/admin/banks", headers=headers)

        assert resp.status_code == 200
        bank = resp.json()[0]
        assert bank["version"] == 2
        assert bank["active_version"] == 1

    def test_the_detail_reports_both(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        db_session.add(
            QuestionBankConfig(
                organisation_id=org.id,
                question_bank_id="test-bank",
                version=2,
                title="Test Bank",
                description="Waiting to be promoted.",
                type="uniform",
                config_yaml=SAMPLE_CONFIG_YAML,
                synced_by=educator.id,
            )
        )
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.get(
            "/api/teaching/admin/banks/test-bank", headers=headers
        )

        assert resp.status_code == 200
        assert resp.json()["version"] == 2
        assert resp.json()["active_version"] == 1

    def test_a_bank_with_nothing_promoted_reports_null(
        self, test_client, db_session
    ):
        """Distinguishable from "promoted version 1" — an admin seeing null
        knows the bank has never been opened, not that it is up to date."""
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        status = (
            db_session.query(QuestionBankOrgStatus)
            .filter_by(organisation_id=org.id, question_bank_id="test-bank")
            .one()
        )
        status.active_version = None
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.get("/api/teaching/admin/banks", headers=headers)

        assert resp.json()[0]["active_version"] is None

    def test_the_admin_list_still_shows_a_bank_with_no_pointer(
        self, test_client, db_session
    ):
        """Unlike the candidate list, which hides it. The admin screen is
        where you go to promote it, so hiding it there would be a trap."""
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        status = (
            db_session.query(QuestionBankOrgStatus)
            .filter_by(organisation_id=org.id, question_bank_id="test-bank")
            .one()
        )
        status.active_version = None
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.get("/api/teaching/admin/banks", headers=headers)

        assert [b["bank_id"] for b in resp.json()] == ["test-bank"]


class TestCandidateQueriesFollowThePointer:
    """Candidates get the version their organisation promoted.

    Syncing a revision imports it but must not put it in front of anyone.
    Without this the newest version won a race nobody entered, changing an
    assessment mid-cohort.
    """

    def _add_version(self, db_session, org, educator, version: int) -> None:
        db_session.add(
            QuestionBankConfig(
                organisation_id=org.id,
                question_bank_id="test-bank",
                version=version,
                title=f"Test Bank v{version}",
                description="A revision nobody promoted.",
                type="uniform",
                config_yaml=SAMPLE_CONFIG_YAML,
                synced_by=educator.id,
            )
        )

    def test_detail_serves_the_promoted_version_not_the_newest(
        self, test_client, db_session
    ):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        self._add_version(db_session, org, educator, 2)
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.get(
            "/api/teaching/question-banks/test-bank", headers=headers
        )

        assert resp.status_code == 200
        assert resp.json()["version"] == 1

    def test_the_list_serves_the_promoted_version(
        self, test_client, db_session
    ):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        self._add_version(db_session, org, educator, 2)
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.get("/api/teaching/question-banks", headers=headers)

        assert resp.status_code == 200
        versions = [b["version"] for b in resp.json()]
        assert versions == [1]

    def test_a_bank_with_no_promoted_version_is_not_listed(
        self, test_client, db_session
    ):
        """A null pointer means nothing has been promoted, so nothing shows."""
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        status = (
            db_session.query(QuestionBankOrgStatus)
            .filter_by(organisation_id=org.id, question_bank_id="test-bank")
            .one()
        )
        status.active_version = None
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.get("/api/teaching/question-banks", headers=headers)

        assert resp.status_code == 200
        assert resp.json() == []

    def test_an_assessment_is_sat_on_the_promoted_version(
        self, test_client, db_session
    ):
        """The one that matters. A revision synced while a cohort is part
        way through must not change the paper they are sitting."""
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        self._add_version(db_session, org, educator, 2)
        for i in range(3):
            db_session.add(
                QuestionBankItem(
                    organisation_id=org.id,
                    question_bank_id="test-bank",
                    bank_version=2,
                    status="published",
                    images=[{"key": f"v2_{i}.png"}],
                    metadata_json={
                        "diagnosis": "adenoma",
                        "_source_dir": f"v2_question_{i}",
                    },
                )
            )
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.post(
            "/api/teaching/assessments",
            headers=headers,
            json={"question_bank_id": "test-bank"},
        )

        assert resp.status_code == 200
        assessment = (
            db_session.query(Assessment)
            .filter_by(question_bank_id="test-bank")
            .one()
        )
        assert assessment.bank_version == 1

    def test_a_bank_with_no_promoted_version_cannot_be_started(
        self, test_client, db_session
    ):
        """The one that matters: no pointer, no assessment."""
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        status = (
            db_session.query(QuestionBankOrgStatus)
            .filter_by(organisation_id=org.id, question_bank_id="test-bank")
            .one()
        )
        status.active_version = None
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.post(
            "/api/teaching/assessments",
            headers=headers,
            json={"question_bank_id": "test-bank"},
        )

        assert resp.status_code == 403


class TestBankOrgSettingsSetTheActiveVersion:
    """Switching a bank on for an organisation fixes which version it serves.

    Nothing else writes ``active_version``: sync imports versions but never
    touches the pointer, so if this endpoint left it null the bank would
    serve nothing once the candidate queries follow it.
    """

    def _settings_url(self, org_id: int) -> str:
        return (
            f"/api/teaching/admin/banks/test-bank"
            f"/organisations/{org_id}/settings"
        )

    def test_creating_the_row_pins_the_current_version(
        self, test_client, db_session
    ):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        db_session.query(QuestionBankOrgStatus).delete()
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.put(
            self._settings_url(org.id),
            headers=headers,
            json={"is_live": True, "site_registration": False},
        )

        assert resp.status_code == 200
        row = (
            db_session.query(QuestionBankOrgStatus)
            .filter_by(organisation_id=org.id, question_bank_id="test-bank")
            .one()
        )
        assert row.active_version == 1

    def test_updating_the_row_leaves_the_version_alone(
        self, test_client, db_session
    ):
        """The case that would promote a revision by accident.

        A bank switched off and on again must not pick up a version that
        arrived meanwhile — advancing the pointer is a separate decision.
        """
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        row = (
            db_session.query(QuestionBankOrgStatus)
            .filter_by(organisation_id=org.id, question_bank_id="test-bank")
            .one()
        )
        row.active_version = 1
        db_session.add(
            QuestionBankConfig(
                organisation_id=org.id,
                question_bank_id="test-bank",
                version=2,
                title="Test Bank",
                description="A revision nobody promoted.",
                type="uniform",
                config_yaml=SAMPLE_CONFIG_YAML,
                synced_by=educator.id,
            )
        )
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.put(
            self._settings_url(org.id),
            headers=headers,
            json={"is_live": False, "site_registration": False},
        )

        assert resp.status_code == 200
        db_session.refresh(row)
        assert row.active_version == 1

    def test_it_pins_the_newest_version_not_an_arbitrary_one(
        self, test_client, db_session
    ):
        """Several versions can be synced for one organisation."""
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        db_session.query(QuestionBankOrgStatus).delete()
        for version in (2, 3):
            db_session.add(
                QuestionBankConfig(
                    organisation_id=org.id,
                    question_bank_id="test-bank",
                    version=version,
                    title="Test Bank",
                    description="Later.",
                    type="uniform",
                    config_yaml=SAMPLE_CONFIG_YAML,
                    synced_by=educator.id,
                )
            )
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        test_client.put(
            self._settings_url(org.id),
            headers=headers,
            json={"is_live": True, "site_registration": False},
        )

        row = (
            db_session.query(QuestionBankOrgStatus)
            .filter_by(organisation_id=org.id, question_bank_id="test-bank")
            .one()
        )
        assert row.active_version == 3


class TestBankOrgSettingsAreScopedToYourOrganisations:
    """The endpoint took an organisation from the path and never checked it.

    It confirmed the organisation existed, then wrote to it. So anyone
    holding ``manage_teaching_content`` could set a bank live or closed for
    an organisation they had nothing to do with, and closing one mid-cohort
    locks its candidates out of an assessment.
    """

    def _settings_url(self, org_id: int) -> str:
        return (
            f"/api/teaching/admin/banks/test-bank"
            f"/organisations/{org_id}/settings"
        )

    def test_settings_for_an_organisation_you_are_not_in_are_refused(
        self, test_client, db_session
    ):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        other = Organisation(name="Not Mine")
        db_session.add(other)
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.put(
            self._settings_url(other.id),
            headers=headers,
            json={"is_live": True, "site_registration": False},
        )

        assert resp.status_code == 403
        # Nothing was written for the organisation the caller does not
        # belong to — a 403 that still wrote would be no fix at all.
        assert (
            db_session.query(QuestionBankOrgStatus)
            .filter_by(organisation_id=other.id)
            .count()
            == 0
        )

    def test_a_bank_held_only_by_your_second_organisation_is_found(
        self, test_client, db_session
    ):
        """Why the bank lookup spans every organisation, not the first one.

        The bank exists for the second organisation only. The old code
        looked it up against ``_get_user_org_id``, which returns whichever
        organisation comes back first, so the bank was invisible and the
        caller got a 404 for a bank plainly in front of them.
        """
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)

        second = Organisation(name="Second Org")
        db_session.add(second)
        db_session.flush()
        db_session.execute(
            organisation_member.insert().values(
                organisation_id=second.id, user_id=educator.id
            )
        )
        db_session.commit()
        _seed_bank(db_session, second.id, educator.id)
        db_session.query(QuestionBankOrgStatus).delete()
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.put(
            self._settings_url(second.id),
            headers=headers,
            json={"is_live": True, "site_registration": False},
        )

        assert resp.status_code == 200
        row = (
            db_session.query(QuestionBankOrgStatus)
            .filter_by(organisation_id=second.id, question_bank_id="test-bank")
            .one()
        )
        assert row.is_live is True
        assert row.active_version == 1


class TestAdminBanks:
    """Admin endpoints for teaching module management."""

    def test_list_admin_banks_db_only(self, test_client, db_session):
        """Lists banks from DB when no GCS configured."""
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.get("/api/teaching/admin/banks", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        bank = data[0]
        assert bank["bank_id"] == "test-bank"
        assert bank["in_db"] is True
        assert bank["title"] == "Test Bank"
        assert bank["item_count"] == 3

    def test_list_admin_banks_empty(self, test_client, db_session):
        """Returns empty list when no banks exist."""
        org = _make_teaching_org(db_session)
        _make_educator(db_session, org)
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.get("/api/teaching/admin/banks", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_admin_bank_detail_includes_email_templates(
        self, test_client, db_session
    ):
        """Email templates are read from DB config_yaml, not filesystem."""
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)

        # Build config with email flags and templates
        config_with_email = {
            **SAMPLE_CONFIG_YAML,
            "results": {
                "certificate_download": False,
                "email_student_on_pass": True,
                "email_coordinator_on_pass": True,
            },
            "student_email": {
                "subject": "Your certificate for $exam_title",
                "body": "Hi $student_name, well done!",
                "attach_certificate": True,
            },
            "coordinator_email": {
                "subject": "Certificate issued: $exam_title",
                "body": "Dear coordinator, $student_name passed.",
                "attach_certificate": False,
            },
        }

        config = QuestionBankConfig(
            organisation_id=org.id,
            question_bank_id="test-bank",
            version=1,
            title="Test Bank",
            description="A test question bank.",
            type="uniform",
            config_yaml=config_with_email,
            synced_by=educator.id,
        )
        db_session.add(config)
        db_session.flush()
        db_session.add(
            QuestionBankOrgStatus(
                organisation_id=org.id,
                question_bank_id="test-bank",
                is_live=True,
            )
        )
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.get(
            "/api/teaching/admin/banks/test-bank", headers=headers
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["email_student_on_pass"] is True
        assert data["email_coordinator_on_pass"] is True

        st = data["student_email_template"]
        assert st is not None
        assert st["subject"] == "Your certificate for $exam_title"
        assert st["attach_certificate"] is True

        ct = data["coordinator_email_template"]
        assert ct is not None
        assert ct["subject"] == "Certificate issued: $exam_title"
        assert ct["attach_certificate"] is False

    def test_admin_bank_detail_no_email_templates_when_disabled(
        self, test_client, db_session
    ):
        """Templates are None when email flags are disabled."""
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        db_session.commit()

        headers = _login(test_client, "testeducator", "Educator123!")
        resp = test_client.get(
            "/api/teaching/admin/banks/test-bank", headers=headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["student_email_template"] is None
        assert data["coordinator_email_template"] is None


class TestVideoSrcResolution:
    """The API exposes a resolved filename, never the raw MDX key.

    The player composes its URL from the ``base_url`` that
    ``/video-access`` returns plus this filename, so the frontend never
    has to know how a ``ref`` maps to a file.
    """

    def test_schema_exposes_video_src_optionally(self) -> None:
        """Optional, so the API change is additive.

        A stale client that has never heard of the field keeps working,
        per the expand-contract rule in the backend conventions.
        """
        from app.features.teaching.schemas import LearningSlideOut

        field = LearningSlideOut.model_fields["video_src"]
        assert field.default is None
        assert not field.is_required()

    def test_a_slide_without_video_resolves_to_none(self) -> None:
        from app.features.teaching.mdx_parser import parse_mdx_to_slides

        slides = parse_mdx_to_slides("## Plain\n\nJust prose.\n")
        assert slides[0].video_ref is None

    def test_the_ref_reaches_the_parser_unchanged(self) -> None:
        """The key is carried verbatim; resolution happens later.

        This is what lets the media-link table replace the development
        filename convention without the MDX or the API shape changing.
        """
        from app.features.teaching.mdx_parser import parse_mdx_to_slides

        content = '## Lecture\n\n<Video ref="patient-experience" />\n'
        slides = parse_mdx_to_slides(content)
        assert slides[0].video_ref == "patient-experience"
        assert slides[0].layout == "video-slide"


class TestLearningContentGate:
    """A user reads learning content only for their own organisations.

    The rule the assessment routes always enforced and the learning
    routes never did: until this gate existed, any authenticated user in
    a teaching-enabled organisation could read any module's slides by
    guessing its ID.

    Every refusal is a 404 rather than a 403, so "not yours", "not live"
    and "no such module" are indistinguishable from outside.
    """

    def test_helper_returns_the_org_that_makes_it_visible(self, db_session):
        """The gate itself, tested directly.

        Through the route, a permitted request still 404s because no
        MDX exists in the test environment — and the content layer's
        refusal is indistinguishable from the gate's. So the allow path
        is asserted on the helper, and the deny paths through the route
        where the status code is the whole point.
        """
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        learner = _make_learner(db_session, org)
        db_session.commit()

        assert (
            resolve_visible_module(learner, db_session, "test-bank") == org.id
        )

    def test_helper_refuses_a_module_no_org_has_live(self, db_session):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id, is_live=False)
        learner = _make_learner(db_session, org)
        db_session.commit()

        with pytest.raises(HTTPException) as exc_info:
            resolve_visible_module(learner, db_session, "test-bank")
        assert exc_info.value.status_code == 404

    def test_helper_takes_any_live_org_when_the_user_has_two(self, db_session):
        """The permissive union: one live organisation is enough.

        This is why the plural resolver is mandatory. The singular one
        returns an arbitrary first organisation, so a learner in two
        would see the module or not depending on set ordering.
        """
        without = _make_teaching_org(db_session)
        with_live = _make_teaching_org(db_session)
        educator = _make_educator(db_session, with_live)
        _seed_bank(db_session, with_live.id, educator.id)

        learner = _make_learner(db_session, without)
        db_session.execute(
            organisation_member.insert().values(
                organisation_id=with_live.id, user_id=learner.id
            )
        )
        db_session.commit()

        assert (
            resolve_visible_module(learner, db_session, "test-bank")
            == with_live.id
        )

    def test_other_orgs_module_is_404(self, test_client, db_session):
        owner = _make_teaching_org(db_session)
        educator = _make_educator(db_session, owner)
        _seed_bank(db_session, owner.id, educator.id)

        # The learner belongs to a different organisation entirely.
        other = _make_teaching_org(db_session)
        _make_learner(db_session, other)
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={"username": "testlearner", "password": "Learner123!"},
        )
        resp = test_client.get("/api/teaching/modules/test-bank/learning")
        assert resp.status_code == 404

    def test_own_module_not_live_is_404(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id, is_live=False)
        _make_learner(db_session, org)
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={"username": "testlearner", "password": "Learner123!"},
        )
        resp = test_client.get("/api/teaching/modules/test-bank/learning")
        # Same 404 as another organisation's module: the caller cannot
        # tell the two apart, which is the point.
        assert resp.status_code == 404

    def test_unknown_module_is_404(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        _make_learner(db_session, org)
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={"username": "testlearner", "password": "Learner123!"},
        )
        resp = test_client.get("/api/teaching/modules/no-such-bank/learning")
        assert resp.status_code == 404

    def test_a_site_member_reaches_the_organisation(
        self, test_client, db_session
    ):
        """Reach, not membership — the case the plural resolver exists for.

        A trainee attached to a ward is not a member of the trust, but
        content is delivered downward, so they receive what the
        organisation made available there. Worth a test of its own
        because the two kinds of membership are easy to conflate, and
        conflating them locks out exactly the people the teaching
        feature is for.
        """
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)

        # The learner belongs to the site, and to no organisation.
        learner = _make_learner(db_session, org)
        db_session.execute(
            organisation_member.delete().where(
                organisation_member.c.user_id == learner.id
            )
        )
        site = Site(name="Ward 9", type="ward")
        db_session.add(site)
        db_session.flush()
        db_session.execute(
            organisation_site.insert().values(
                organisation_id=org.id, site_id=site.id
            )
        )
        db_session.execute(
            site_member.insert().values(
                site_id=site.id, user_id=learner.id, capacity="staff"
            )
        )
        db_session.commit()

        assert (
            resolve_visible_module(learner, db_session, "test-bank") == org.id
        )

    def test_module_list_excludes_other_orgs(self, test_client, db_session):
        owner = _make_teaching_org(db_session)
        educator = _make_educator(db_session, owner)
        _seed_bank(db_session, owner.id, educator.id)

        other = _make_teaching_org(db_session)
        _make_learner(db_session, other)
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={"username": "testlearner", "password": "Learner123!"},
        )
        resp = test_client.get("/api/teaching/modules")
        # An empty list, not an error: nothing visible is a valid answer.
        assert resp.status_code == 200
        assert resp.json() == []


class TestLearningRoutesRequireTheViewCompetency:
    """Membership says where; the competency says what may be done there.

    The organisation gate landed first and answered only the first
    question, so a person at an organisation with a module live could
    read it whatever their competencies said. The video route beside it
    already required `view_teaching_cases`, which made the slides
    cheaper to reach than the video of them — the same asymmetry that
    left the pair half-closed before.
    """

    def _consultant_in(self, db: Session, org: Organisation) -> User:
        """A clinician whose profession does not grant the competency."""
        user = User(
            username="testconsultant",
            email="consultant@test.local",
            password_hash=hash_password("Consultant123!"),
            is_active=True,
            email_verified=True,
            base_profession="consultant",
            system_permissions="staff",
        )
        db.add(user)
        db.flush()
        db.execute(
            organisation_member.insert().values(
                organisation_id=org.id, user_id=user.id
            )
        )
        db.flush()
        return user

    def test_reading_a_module_needs_the_competency(
        self, test_client, db_session
    ):
        """Membership alone is not enough, even for a live module."""
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        self._consultant_in(db_session, org)
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={
                "username": "testconsultant",
                "password": "Consultant123!",
            },
        )
        resp = test_client.get("/api/teaching/modules/test-bank/learning")

        assert resp.status_code == 403

    def test_listing_modules_needs_the_competency(
        self, test_client, db_session
    ):
        """403, not an empty list.

        The listing answers `[]` for someone who may read nothing, so a
        missing competency has to refuse outright — otherwise it would
        be indistinguishable from having nothing delivered.
        """
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        self._consultant_in(db_session, org)
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={
                "username": "testconsultant",
                "password": "Consultant123!",
            },
        )
        resp = test_client.get("/api/teaching/modules")

        assert resp.status_code == 403

    def test_the_competency_can_be_granted_to_a_clinician(
        self, test_client, db_session
    ):
        """Only 3 of 22 professions grant it, so this is the escape hatch.

        Without it the narrowing would lock out every ordinary clinician
        permanently rather than pending an admin's decision.
        """
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        consultant = self._consultant_in(db_session, org)
        consultant.additional_competencies = ["view_teaching_cases"]
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={
                "username": "testconsultant",
                "password": "Consultant123!",
            },
        )
        resp = test_client.get("/api/teaching/modules")

        assert resp.status_code == 200


class TestVideoAccess:
    """The video access gate.

    The same organisation rule as learning content, plus a signed
    cookie. Refusals are 404 throughout, so the endpoint cannot be used
    to enumerate which modules exist elsewhere.
    """

    def _login(self, test_client) -> dict[str, str]:
        """Log in and return the CSRF header the endpoint requires.

        This is the first CSRF-protected route in the teaching router,
        so a POST without the header is a 403 — which looks exactly
        like a competency refusal or a signing fault.
        """
        return _login(test_client, "testlearner", "Learner123!")

    def test_grants_access_to_a_live_module(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        _make_learner(db_session, org)
        db_session.commit()

        headers = self._login(test_client)
        resp = test_client.post(
            "/api/teaching/modules/test-bank/video-access",
            headers=headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "base_url" in body
        assert "expires_at" in body

    def test_another_orgs_module_is_404(self, test_client, db_session):
        owner = _make_teaching_org(db_session)
        educator = _make_educator(db_session, owner)
        _seed_bank(db_session, owner.id, educator.id)

        other = _make_teaching_org(db_session)
        _make_learner(db_session, other)
        db_session.commit()

        headers = self._login(test_client)
        resp = test_client.post(
            "/api/teaching/modules/test-bank/video-access",
            headers=headers,
        )
        # 404 rather than 403: a 403 would confirm the module exists.
        assert resp.status_code == 404

    def test_a_module_not_live_is_404(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id, is_live=False)
        _make_learner(db_session, org)
        db_session.commit()

        headers = self._login(test_client)
        resp = test_client.post(
            "/api/teaching/modules/test-bank/video-access",
            headers=headers,
        )
        assert resp.status_code == 404

    def test_without_csrf_is_refused(self, test_client, db_session):
        """The first CSRF-protected route in this router.

        Worth pinning: a missing header produces a 403 that looks
        identical to a competency refusal or a signing fault, and the
        plan flagged it as the thing to check before assuming either.
        """
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        _make_learner(db_session, org)
        db_session.commit()

        self._login(test_client)
        resp = test_client.post("/api/teaching/modules/test-bank/video-access")
        assert resp.status_code == 403

    def test_unauthenticated_is_refused(self, test_client, db_session):
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        db_session.commit()

        resp = test_client.post("/api/teaching/modules/test-bank/video-access")
        assert resp.status_code in (401, 403)

    def test_no_cookie_is_set_without_cdn_config(
        self, test_client, db_session
    ):
        """Development returns a base URL and sets no cookie.

        Not an error: the frontend consumes ``base_url`` and never
        branches on environment, so the same code path runs everywhere.
        """
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        _make_learner(db_session, org)
        db_session.commit()

        headers = self._login(test_client)
        resp = test_client.post(
            "/api/teaching/modules/test-bank/video-access",
            headers=headers,
        )
        assert resp.status_code == 200
        assert "Cloud-CDN-Cookie" not in resp.cookies
        assert resp.json()["base_url"].endswith("/test-bank")


class TestMediaUploadUrl:
    """Minting a resumable upload URL.

    The one place the backend holds real GCS write credentials, so the
    allow-list and the path validation are the boundary rather than
    conveniences.
    """

    def _login(self, test_client) -> dict[str, str]:
        return _login(test_client, "testeducator", "Educator123!")

    def _body(self, **over) -> dict:
        body = {
            "media_key": "lecture-01",
            "original_filename": "EoEETA_Colonoscopy_FINAL_v3.mp4",
            "content_type": "video/mp4",
            "size_bytes": 943718400,
        }
        body.update(over)
        return body

    def test_upload_is_refused_without_a_source_bucket(
        self, test_client, db_session
    ):
        """No source bucket means no upload, rather than a 500.

        This is the development answer: the bucket exists only in the
        teaching environment.
        """
        org = _make_teaching_org(db_session)
        _make_educator(db_session, org)
        db_session.commit()

        headers = self._login(test_client)
        resp = test_client.post(
            "/api/teaching/admin/modules/test-bank/media/upload-url",
            json=self._body(),
            headers=headers,
        )
        assert resp.status_code == 503

    @pytest.mark.parametrize(
        "filename",
        ["notes.pdf", "slide.png", "script.sh", "archive.zip", "lecture"],
    )
    def test_rejects_files_outside_the_allow_list(
        self, test_client, db_session, filename
    ):
        org = _make_teaching_org(db_session)
        _make_educator(db_session, org)
        db_session.commit()

        headers = self._login(test_client)
        resp = test_client.post(
            "/api/teaching/admin/modules/test-bank/media/upload-url",
            json=self._body(original_filename=filename),
            headers=headers,
        )
        # 400 before the 503: the type is refused without ever reaching
        # the bucket check.
        assert resp.status_code == 400

    def test_a_content_type_that_contradicts_the_extension_is_refused(
        self, test_client, db_session
    ):
        """Both are checked, because a caller controls both.

        Trusting one to vouch for the other is how an allow-list gets
        walked around.
        """
        org = _make_teaching_org(db_session)
        _make_educator(db_session, org)
        db_session.commit()

        headers = self._login(test_client)
        resp = test_client.post(
            "/api/teaching/admin/modules/test-bank/media/upload-url",
            json=self._body(content_type="application/x-sh"),
            headers=headers,
        )
        assert resp.status_code == 400

    def test_a_learner_cannot_mint_an_upload_url(
        self, test_client, db_session
    ):
        """Gated on manage_teaching_content, which a learner lacks."""
        org = _make_teaching_org(db_session)
        _make_learner(db_session, org)
        db_session.commit()

        headers = _login(test_client, "testlearner", "Learner123!")
        resp = test_client.post(
            "/api/teaching/admin/modules/test-bank/media/upload-url",
            json=self._body(),
            headers=headers,
        )
        assert resp.status_code == 403


class TestModuleMedia:
    """The admin card's data.

    Every assertion here is per organisation, because the links are.
    Two organisations running the same module hold separate uploads.
    """

    def _login(self, test_client) -> dict[str, str]:
        return _login(test_client, "testeducator", "Educator123!")

    def _content(self, tmp_path, *refs: str) -> str:
        """Write a module on disk whose MDX carries *refs*.

        The content repository sits between the base path and
        ``modules/`` — ``resolve_module_dir`` looks one level down for
        it, so a fixture without it resolves to nothing and every
        reference silently disappears.
        """
        learning = tmp_path / "content-repo" / "modules" / "test-bank"
        learning = learning / "learning"
        learning.mkdir(parents=True)
        (learning.parent / "module.yaml").write_text(
            "moduleId: test-bank\ntitle: Test\n", encoding="utf-8"
        )
        slides = "\n\n".join(
            f'## Slide {i}\n\n<Video ref="{ref}" />'
            for i, ref in enumerate(refs, start=1)
        )
        (learning / "content.mdx").write_text(
            slides or "## Text only\n\nNo media here.", encoding="utf-8"
        )
        return str(tmp_path)

    def _use(self, monkeypatch, base_path: str) -> None:
        monkeypatch.setattr(
            "app.config.settings.TEACHING_QUESTION_BANK_PATH", base_path
        )
        monkeypatch.setattr("app.config.settings.TEACHING_GCS_BUCKET", None)

    def _upload(self, db, org_id: int, key: str, asset: str) -> None:
        db.add(
            ModuleMediaLink(
                organisation_id=org_id,
                question_bank_id="test-bank",
                media_key=key,
                asset_id=asset,
                original_filename=f"{asset}.mp4",
                content_type="video/mp4",
                size_bytes=1024,
                uploaded_at=datetime.now(UTC),
            )
        )
        db.flush()

    def _get(self, test_client, headers):
        return test_client.get(
            "/api/teaching/admin/modules/test-bank/media", headers=headers
        )

    def test_a_reference_without_an_upload_reads_as_missing(
        self, test_client, db_session, monkeypatch, tmp_path
    ):
        org = _make_teaching_org(db_session)
        _make_educator(db_session, org)
        db_session.commit()
        self._use(monkeypatch, self._content(tmp_path, "lecture-01"))

        resp = self._get(test_client, self._login(test_client))

        assert resp.status_code == 200
        body = resp.json()
        assert body["is_complete"] is False
        assert body["references"] == [{"key": "lecture-01", "asset": None}]

    def test_a_linked_reference_reports_its_file(
        self, test_client, db_session, monkeypatch, tmp_path
    ):
        """The original filename is shown so the uploader recognises it."""
        org = _make_teaching_org(db_session)
        _make_educator(db_session, org)
        self._upload(db_session, org.id, "lecture-01", "asset-1")
        db_session.commit()
        self._use(monkeypatch, self._content(tmp_path, "lecture-01"))

        resp = self._get(test_client, self._login(test_client))

        body = resp.json()
        assert body["is_complete"] is True
        assert body["references"][0]["asset"]["asset_id"] == "asset-1"
        assert (
            body["references"][0]["asset"]["original_filename"]
            == "asset-1.mp4"
        )

    def test_an_upload_with_no_reference_is_unattached(
        self, test_client, db_session, monkeypatch, tmp_path
    ):
        """What a renamed or removed reference leaves behind.

        Without a row for it the file is invisible bytes nobody can
        reach or remove.
        """
        org = _make_teaching_org(db_session)
        _make_educator(db_session, org)
        self._upload(db_session, org.id, "old-name", "asset-1")
        db_session.commit()
        self._use(monkeypatch, self._content(tmp_path, "new-name"))

        body = self._get(test_client, self._login(test_client)).json()

        assert [a["asset_id"] for a in body["unattached"]] == ["asset-1"]
        assert body["is_complete"] is False

    def test_another_organisations_upload_does_not_count(
        self, test_client, db_session, monkeypatch, tmp_path
    ):
        """The property the whole per-organisation model rests on.

        B's file must not make A's module look complete — that would
        serve A's learners a video their organisation never uploaded.
        """
        org = _make_teaching_org(db_session)
        _make_educator(db_session, org)
        other = Organisation(name="Other Trust")
        db_session.add(other)
        db_session.flush()
        self._upload(db_session, other.id, "lecture-01", "asset-b")
        db_session.commit()
        self._use(monkeypatch, self._content(tmp_path, "lecture-01"))

        body = self._get(test_client, self._login(test_client)).json()

        assert body["is_complete"] is False
        assert body["references"][0]["asset"] is None
        assert body["unattached"] == []

    def test_a_module_of_pure_text_references_nothing(
        self, test_client, db_session, monkeypatch, tmp_path
    ):
        """The card is not shown for one, so it must not look broken."""
        org = _make_teaching_org(db_session)
        _make_educator(db_session, org)
        db_session.commit()
        self._use(monkeypatch, self._content(tmp_path))

        body = self._get(test_client, self._login(test_client)).json()

        assert body["references"] == []
        assert body["is_complete"] is True

    def test_references_keep_their_order_and_deduplicate(
        self, test_client, db_session, monkeypatch, tmp_path
    ):
        """Rows follow the content, and one key is one upload."""
        org = _make_teaching_org(db_session)
        _make_educator(db_session, org)
        db_session.commit()
        self._use(monkeypatch, self._content(tmp_path, "b", "a", "b"))

        body = self._get(test_client, self._login(test_client)).json()

        assert [r["key"] for r in body["references"]] == ["b", "a"]

    def test_a_learner_cannot_read_the_card(
        self, test_client, db_session, monkeypatch, tmp_path
    ):
        """Gated on manage_teaching_content, which a learner lacks."""
        org = _make_teaching_org(db_session)
        _make_learner(db_session, org)
        db_session.commit()
        self._use(monkeypatch, self._content(tmp_path, "lecture-01"))

        headers = _login(test_client, "testlearner", "Learner123!")
        resp = self._get(test_client, headers)

        assert resp.status_code == 403
