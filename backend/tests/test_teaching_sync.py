"""Tests for the teaching feature — sync module."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.teaching.models import (
    QuestionBankConfig,
    QuestionBankItem,
    QuestionBankSync,
)
from app.features.teaching.sync import sync_question_bank
from app.models import Organization, User
from app.security import hash_password


@pytest.fixture()
def organisation(db_session: Session) -> Organization:
    org = Organization(name="Teaching Org")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture()
def admin_user(db_session: Session) -> User:
    user = User(
        username="syncadmin",
        email="sync@example.com",
        password_hash=hash_password("Pass123!"),
        is_active=True,
        system_permissions="admin",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _make_bank(tmp_path: Path, *, item_count: int = 2) -> Path:
    """Create a minimal uniform question bank on the filesystem."""
    bank = tmp_path / "test-bank"
    bank.mkdir(exist_ok=True)
    config = {
        "id": "test-bank",
        "version": 1,
        "title": "Test Bank",
        "description": "A test question bank",
        "type": "uniform",
        "images_per_item": 1,
        "image_labels": ["Image 1"],
        "options": [
            {"id": "opt_a", "label": "A", "tags": ["tag_a"]},
            {"id": "opt_b", "label": "B", "tags": ["tag_b"]},
        ],
        "correct_answer_field": "diagnosis",
        "correct_answer_values": ["adenoma", "serrated"],
        "assessment": {
            "items_per_attempt": item_count,
            "time_limit_minutes": 10,
            "min_pool_size": 0,
        },
    }
    (bank / "config.yaml").write_text(
        yaml.dump(config, default_flow_style=False)
    )
    for i in range(1, item_count + 1):
        q_dir = bank / f"question_{i:03d}"
        q_dir.mkdir(exist_ok=True)
        (q_dir / "question.yaml").write_text(
            yaml.dump({"diagnosis": "adenoma"})
        )
        (q_dir / "image_1.png").write_bytes(b"fake")
    return bank


class TestSyncQuestionBank:
    """Sync from filesystem to database."""

    def test_validate_only(self, db_session, tmp_path: Path) -> None:
        bank = _make_bank(tmp_path)
        validation, sync_record = sync_question_bank(
            bank,
            organisation_id=1,
            user_id=1,
            db=db_session,
            validate_only=True,
        )
        assert validation.is_valid
        assert sync_record is None
        # No DB rows created
        assert (
            db_session.execute(select(QuestionBankConfig)).scalar_one_or_none()
            is None
        )

    def test_sync_creates_config_and_items(
        self, db_session, organisation, admin_user, tmp_path: Path
    ) -> None:
        bank = _make_bank(tmp_path, item_count=3)
        validation, sync_record = sync_question_bank(
            bank,
            organisation_id=organisation.id,
            user_id=admin_user.id,
            db=db_session,
        )
        assert validation.is_valid
        assert sync_record is not None
        assert sync_record.status == "success"
        assert sync_record.items_created == 3
        assert sync_record.items_updated == 0

        # Check config was stored
        config = db_session.execute(
            select(QuestionBankConfig).where(
                QuestionBankConfig.question_bank_id == "test-bank"
            )
        ).scalar_one()
        assert config.version == 1
        assert config.type == "uniform"

        # Check items were created
        items = (
            db_session.execute(
                select(QuestionBankItem).where(
                    QuestionBankItem.question_bank_id == "test-bank"
                )
            )
            .scalars()
            .all()
        )
        assert len(items) == 3
        assert all(i.status == "published" for i in items)

    def test_sync_updates_existing_items(
        self, db_session, organisation, admin_user, tmp_path: Path
    ) -> None:
        bank = _make_bank(tmp_path, item_count=2)
        # First sync
        sync_question_bank(
            bank,
            organisation_id=organisation.id,
            user_id=admin_user.id,
            db=db_session,
        )
        # Second sync — should update, not create
        validation, sync_record = sync_question_bank(
            bank,
            organisation_id=organisation.id,
            user_id=admin_user.id,
            db=db_session,
        )
        assert sync_record is not None
        assert sync_record.items_created == 0
        assert sync_record.items_updated == 2

    def test_sync_fails_on_invalid_bank(
        self, db_session, organisation, admin_user, tmp_path: Path
    ) -> None:
        bank = tmp_path / "bad-bank"
        bank.mkdir()
        (bank / "config.yaml").write_text(
            yaml.dump(
                {
                    "id": "bad-bank",
                    "version": 1,
                    "title": "Bad",
                    "description": "Invalid",
                    "type": "uniform",
                    "assessment": {
                        "items_per_attempt": 1,
                        "time_limit_minutes": 5,
                        "min_pool_size": 0,
                    },
                }
            )
        )
        validation, sync_record = sync_question_bank(
            bank,
            organisation_id=organisation.id,
            user_id=admin_user.id,
            db=db_session,
        )
        assert not validation.is_valid
        assert sync_record is not None
        assert sync_record.status == "failed"
        assert len(sync_record.errors) > 0

    def test_sync_record_audit_trail(
        self, db_session, organisation, admin_user, tmp_path: Path
    ) -> None:
        bank = _make_bank(tmp_path)
        sync_question_bank(
            bank,
            organisation_id=organisation.id,
            user_id=admin_user.id,
            db=db_session,
        )
        records = (
            db_session.execute(
                select(QuestionBankSync).where(
                    QuestionBankSync.organisation_id == organisation.id
                )
            )
            .scalars()
            .all()
        )
        assert len(records) == 1
        assert records[0].triggered_by == admin_user.id
        assert records[0].completed_at is not None

    def test_sync_with_image_inventory(
        self, db_session, organisation, admin_user, tmp_path: Path
    ) -> None:
        """Sync succeeds with GCS image inventory (no local images)."""
        bank = _make_bank(tmp_path, item_count=2)
        # Remove local images to simulate GCS download (YAML only)
        for q_dir in bank.iterdir():
            if q_dir.is_dir():
                for img in q_dir.glob("*.png"):
                    img.unlink()

        # Provide image inventory as if from GCS
        inventory = {
            "question_001": {"image_1.png"},
            "question_002": {"image_1.png"},
        }
        validation, sync_record = sync_question_bank(
            bank,
            organisation_id=organisation.id,
            user_id=admin_user.id,
            db=db_session,
            image_inventory=inventory,
        )
        assert validation.is_valid
        assert sync_record is not None
        assert sync_record.status == "success"
        assert sync_record.items_created == 2
