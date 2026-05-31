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
from app.features.teaching.sync import _load_module_status, sync_question_bank
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
        "images": [{"key": "wli.png", "label": "White light"}],
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
        (q_dir / "wli.png").write_bytes(b"fake")
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
            "question_001": {"wli.png"},
            "question_002": {"wli.png"},
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

        # Verify images were populated from the inventory
        items = (
            db_session.execute(
                select(QuestionBankItem).where(
                    QuestionBankItem.question_bank_id == "test-bank"
                )
            )
            .scalars()
            .all()
        )
        for item in items:
            assert item.images == [{"key": "wli.png"}]

    def test_sync_with_multiple_config_images(
        self, db_session, organisation, admin_user, tmp_path: Path
    ) -> None:
        """Sync stores multiple config-defined image keys."""
        bank = tmp_path / "multi-images-bank"
        bank.mkdir()
        config = {
            "id": "multi-images-bank",
            "version": 1,
            "title": "Multi Images Bank",
            "description": "Bank with multiple named image keys",
            "type": "uniform",
            "images_per_item": 2,
            "images": [
                {"key": "wli.png", "label": "White light"},
                {"key": "nbi.png", "label": "Narrow band"},
            ],
            "options": [
                {"id": "opt_a", "label": "A"},
                {"id": "opt_b", "label": "B"},
            ],
            "correct_answer_field": "diagnosis",
            "correct_answer_values": ["adenoma"],
            "assessment": {
                "items_per_attempt": 1,
                "time_limit_minutes": 5,
                "min_pool_size": 0,
            },
        }
        (bank / "assessment.yaml").write_text(
            yaml.dump(config, default_flow_style=False)
        )
        q_dir = bank / "question_001"
        q_dir.mkdir()
        (q_dir / "question.yaml").write_text(
            yaml.dump({"diagnosis": "adenoma"})
        )
        (q_dir / "wli.png").write_bytes(b"fake-wli")
        (q_dir / "nbi.png").write_bytes(b"fake-nbi")

        validation, sync_record = sync_question_bank(
            bank,
            organisation_id=organisation.id,
            user_id=admin_user.id,
            db=db_session,
        )
        assert validation.is_valid
        assert sync_record is not None
        assert sync_record.status == "success"
        assert sync_record.items_created == 1

        items = (
            db_session.execute(
                select(QuestionBankItem).where(
                    QuestionBankItem.question_bank_id == "multi-images-bank"
                )
            )
            .scalars()
            .all()
        )
        assert len(items) == 1
        assert items[0].images == [
            {"key": "wli.png"},
            {"key": "nbi.png"},
        ]


class TestLoadModuleStatus:
    """Test _load_module_status reads from parent directory."""

    def test_reads_status_from_parent_module_yaml(
        self, tmp_path: Path
    ) -> None:
        module_dir = tmp_path / "my-module"
        module_dir.mkdir()
        (module_dir / "module.yaml").write_text(
            yaml.dump({"moduleId": "my-module", "status": "live"})
        )
        assessment_dir = module_dir / "assessment"
        assessment_dir.mkdir()
        assert _load_module_status(assessment_dir) == "live"

    def test_returns_none_when_no_module_yaml(self, tmp_path: Path) -> None:
        bank_dir = tmp_path / "some-bank"
        bank_dir.mkdir()
        assert _load_module_status(bank_dir) is None

    def test_returns_none_for_invalid_yaml(self, tmp_path: Path) -> None:
        module_dir = tmp_path / "bad-module"
        module_dir.mkdir()
        (module_dir / "module.yaml").write_text(": invalid: yaml: [")
        assessment_dir = module_dir / "assessment"
        assessment_dir.mkdir()
        assert _load_module_status(assessment_dir) is None

    def test_returns_none_when_status_not_string(self, tmp_path: Path) -> None:
        module_dir = tmp_path / "num-status"
        module_dir.mkdir()
        (module_dir / "module.yaml").write_text(yaml.dump({"status": 123}))
        assessment_dir = module_dir / "assessment"
        assessment_dir.mkdir()
        assert _load_module_status(assessment_dir) is None


class TestVersionGuard:
    """Test version guard logic in sync_question_bank."""

    def test_draft_rejected_when_version_not_1(
        self, db_session, organisation, admin_user, tmp_path: Path
    ) -> None:
        """Draft modules must have version 1."""
        bank = _make_bank(tmp_path)
        # Overwrite config with version 2
        config = yaml.safe_load((bank / "config.yaml").read_text())
        config["version"] = 2
        (bank / "config.yaml").write_text(yaml.dump(config))

        validation, sync_record = sync_question_bank(
            bank,
            organisation_id=organisation.id,
            user_id=admin_user.id,
            db=db_session,
            module_status="draft",
        )
        assert not validation.is_valid
        assert sync_record is None
        assert any("Draft" in e.message for e in validation.errors)

    def test_draft_accepted_when_version_is_1(
        self, db_session, organisation, admin_user, tmp_path: Path
    ) -> None:
        """Draft modules with version 1 sync normally."""
        bank = _make_bank(tmp_path)
        validation, sync_record = sync_question_bank(
            bank,
            organisation_id=organisation.id,
            user_id=admin_user.id,
            db=db_session,
            module_status="draft",
        )
        assert validation.is_valid
        assert sync_record is not None
        assert sync_record.status == "success"

    def test_live_rejected_when_version_le_stored(
        self, db_session, organisation, admin_user, tmp_path: Path
    ) -> None:
        """Live modules must have version > stored version."""
        bank = _make_bank(tmp_path)
        # First sync — establishes version 1
        sync_question_bank(
            bank,
            organisation_id=organisation.id,
            user_id=admin_user.id,
            db=db_session,
            module_status="live",
        )
        # Second sync with same version — should be rejected
        validation, sync_record = sync_question_bank(
            bank,
            organisation_id=organisation.id,
            user_id=admin_user.id,
            db=db_session,
            module_status="live",
        )
        assert not validation.is_valid
        assert sync_record is None
        assert any("not greater than" in e.message for e in validation.errors)

    def test_live_accepted_when_version_gt_stored(
        self, db_session, organisation, admin_user, tmp_path: Path
    ) -> None:
        """Live modules with incremented version sync normally."""
        bank = _make_bank(tmp_path)
        # First sync — version 1
        sync_question_bank(
            bank,
            organisation_id=organisation.id,
            user_id=admin_user.id,
            db=db_session,
            module_status="live",
        )
        # Bump to version 2
        config = yaml.safe_load((bank / "config.yaml").read_text())
        config["version"] = 2
        (bank / "config.yaml").write_text(yaml.dump(config))

        validation, sync_record = sync_question_bank(
            bank,
            organisation_id=organisation.id,
            user_id=admin_user.id,
            db=db_session,
            module_status="live",
        )
        assert validation.is_valid
        assert sync_record is not None
        assert sync_record.status == "success"

    def test_live_first_sync_accepted(
        self, db_session, organisation, admin_user, tmp_path: Path
    ) -> None:
        """Live modules with no stored version sync normally."""
        bank = _make_bank(tmp_path)
        validation, sync_record = sync_question_bank(
            bank,
            organisation_id=organisation.id,
            user_id=admin_user.id,
            db=db_session,
            module_status="live",
        )
        assert validation.is_valid
        assert sync_record is not None
        assert sync_record.status == "success"

    def test_retired_imports_normally(
        self, db_session, organisation, admin_user, tmp_path: Path
    ) -> None:
        """Retired modules are not blocked by the version guard."""
        bank = _make_bank(tmp_path)
        validation, sync_record = sync_question_bank(
            bank,
            organisation_id=organisation.id,
            user_id=admin_user.id,
            db=db_session,
            module_status="retired",
        )
        assert validation.is_valid
        assert sync_record is not None
        assert sync_record.status == "success"

    def test_status_read_from_module_yaml_when_not_passed(
        self, db_session, organisation, admin_user, tmp_path: Path
    ) -> None:
        """When module_status is not passed, reads from module.yaml."""
        # Create module layout: module_dir/module.yaml + module_dir/assessment/
        module_dir = tmp_path / "my-module"
        module_dir.mkdir()
        (module_dir / "module.yaml").write_text(
            yaml.dump({"moduleId": "my-module", "status": "draft"})
        )
        assessment_dir = module_dir / "assessment"
        assessment_dir.mkdir()

        # Create bank content in assessment dir
        config = {
            "id": "my-module",
            "version": 2,  # Invalid for draft
            "title": "Test",
            "description": "Test",
            "type": "uniform",
            "images_per_item": 1,
            "images": [{"key": "wli.png", "label": "White light"}],
            "options": [
                {"id": "opt_a", "label": "A", "tags": ["a"]},
                {"id": "opt_b", "label": "B", "tags": ["b"]},
            ],
            "correct_answer_field": "diagnosis",
            "correct_answer_values": ["adenoma"],
            "assessment": {
                "items_per_attempt": 1,
                "time_limit_minutes": 5,
                "min_pool_size": 0,
            },
        }
        (assessment_dir / "assessment.yaml").write_text(yaml.dump(config))
        q_dir = assessment_dir / "question_001"
        q_dir.mkdir()
        (q_dir / "question.yaml").write_text(
            yaml.dump({"diagnosis": "adenoma"})
        )
        (q_dir / "wli.png").write_bytes(b"fake")

        # No module_status passed — should read "draft" from module.yaml
        # and reject because version is 2
        validation, sync_record = sync_question_bank(
            assessment_dir,
            organisation_id=organisation.id,
            user_id=admin_user.id,
            db=db_session,
        )
        assert not validation.is_valid
        assert sync_record is None
        assert any("Draft" in e.message for e in validation.errors)
