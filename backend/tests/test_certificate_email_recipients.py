"""Tests for who is emailed when a candidate passes.

``_maybe_enqueue_certificate_emails`` decides this, and had no test at all.
That was found the hard way: a change to it referenced a name it had not
imported, the module still imported because Python resolves the name only
when the function runs, and the whole suite passed either way. The bug
would have shipped and surfaced as a certificate email that never arrived.

These tests describe the behaviour as it stands today, so the coordinator
lookup can be moved off ``site_member.role`` and onto the clinical
lead post without changing who receives anything.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import BackgroundTasks
from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.cbac.positions import set_clinical_lead
from app.features.teaching.models import (
    Assessment,
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.features.teaching.router import _maybe_enqueue_certificate_emails
from app.models import (
    Organisation,
    Site,
    User,
    organisation_site,
    site_member,
)
from app.security import hash_password

BANK_ID = "test-bank"


def _config_yaml(
    *, student: bool = False, coordinator: bool = False
) -> dict[str, Any]:
    """A bank config with the email flags and templates under test."""
    return {
        "id": BANK_ID,
        "title": "Test Bank",
        "results": {
            "email_student_on_pass": student,
            "email_coordinator_on_pass": coordinator,
        },
        "student_email": {
            "subject": "You passed",
            "body": "Well done {{recipient_name}}.",
            "attach_certificate": False,
        },
        "coordinator_email": {
            "subject": "A candidate passed",
            "body": "For your records, {{recipient_name}}.",
            "attach_certificate": False,
        },
    }


def _user(db: Session, username: str, email: str) -> User:
    user = User(
        username=username,
        email=email,
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
        system_permissions="staff",
    )
    db.add(user)
    db.commit()
    return user


def _org(db: Session, name: str) -> Organisation:
    org = Organisation(name=name, type="hospital")
    db.add(org)
    db.commit()
    return org


def _site_of(db: Session, org: Organisation, name: str) -> Site:
    site = Site(name=name, type="ward")
    db.add(site)
    db.commit()
    db.execute(
        insert(organisation_site).values(
            organisation_id=org.id, site_id=site.id
        )
    )
    db.commit()
    return site


def _make_lead(db: Session, site: Site, user: User) -> None:
    """Make someone the clinical lead, the way the API does.

    Both the post and the role column are written while the column still
    exists. The post is what the lookup reads; the column is written until
    the contract step removes it.
    """
    db.execute(
        insert(site_member).values(
            site_id=site.id, user_id=user.id, capacity="staff"
        )
    )
    set_clinical_lead(db, site, user)
    db.commit()


def _setup(
    db: Session,
    *,
    student: bool = False,
    coordinator: bool = False,
    is_live: bool = True,
) -> tuple[Organisation, User, Assessment, QuestionBankConfig]:
    org = _org(db, "Trust")
    candidate = _user(db, "candidate", "candidate@example.test")

    config_row = QuestionBankConfig(
        organisation_id=org.id,
        question_bank_id=BANK_ID,
        version=1,
        title="Test Bank",
        description="A bank.",
        type="uniform",
        config_yaml=_config_yaml(student=student, coordinator=coordinator),
        synced_by=candidate.id,
    )
    db.add(config_row)
    db.add(
        QuestionBankOrgStatus(
            organisation_id=org.id,
            question_bank_id=BANK_ID,
            is_live=is_live,
            active_version=1,
        )
    )
    db.commit()

    assessment = Assessment(
        user_id=candidate.id,
        organisation_id=org.id,
        question_bank_id=BANK_ID,
        bank_version=1,
        time_limit_minutes=60,
        total_items=3,
        is_passed=True,
        completed_at=datetime.now(UTC),
    )
    db.add(assessment)
    db.commit()

    return org, candidate, assessment, config_row


def _run(
    db: Session,
    assessment: Assessment,
    config_row: QuestionBankConfig,
    user: User,
) -> list[str]:
    """Call the function and return the addresses it queued."""
    tasks = BackgroundTasks()
    _maybe_enqueue_certificate_emails(
        background_tasks=tasks,
        assessment=assessment,
        config_row=config_row,
        user=user,
        db=db,
        criteria_results=[{"name": "Accuracy", "value": 0.9}],
    )
    return [t.kwargs["to"] for t in tasks.tasks]


class TestWhenNothingIsSent:
    """The guards that stop an email going out at all."""

    def test_neither_flag_sends_nothing(self, db_session):
        _org_, candidate, assessment, config_row = _setup(db_session)

        assert _run(db_session, assessment, config_row, candidate) == []

    def test_a_bank_that_is_not_live_sends_nothing(self, db_session):
        """A closed bank must not email anyone, flags or no flags."""
        _org_, candidate, assessment, config_row = _setup(
            db_session, student=True, coordinator=True, is_live=False
        )

        assert _run(db_session, assessment, config_row, candidate) == []


class TestTheCandidate:
    """The student email."""

    def test_the_candidate_is_emailed_when_enabled(self, db_session):
        _org_, candidate, assessment, config_row = _setup(
            db_session, student=True
        )

        assert _run(db_session, assessment, config_row, candidate) == [
            "candidate@example.test"
        ]

    def test_a_candidate_without_an_address_is_skipped(self, db_session):
        """`User.email` is NOT NULL, so the empty string is the only
        no-address state the database allows. The guard in the function
        defends against that, not against None."""
        _org_, candidate, assessment, config_row = _setup(
            db_session, student=True
        )
        candidate.email = ""
        db_session.commit()

        assert _run(db_session, assessment, config_row, candidate) == []


class TestTheClinicalLead:
    """The coordinator email, which is the lookup about to be moved."""

    def test_the_lead_of_a_linked_site_is_emailed(self, db_session):
        org, candidate, assessment, config_row = _setup(
            db_session, coordinator=True
        )
        site = _site_of(db_session, org, "Ward 1")
        lead = _user(db_session, "dr_lead", "lead@example.test")
        _make_lead(db_session, site, lead)

        assert _run(db_session, assessment, config_row, candidate) == [
            "lead@example.test"
        ]

    def test_nobody_is_emailed_when_the_post_is_empty(self, db_session):
        """The vacancy case, and the one most at risk in the move.

        A site with no clinical lead must produce no coordinator email,
        rather than an error or an email to the wrong person.
        """
        org, candidate, assessment, config_row = _setup(
            db_session, coordinator=True
        )
        _site_of(db_session, org, "Ward 1")

        assert _run(db_session, assessment, config_row, candidate) == []

    def test_a_lead_at_another_organisation_is_not_emailed(self, db_session):
        """Only sites linked to the assessment's organisation count."""
        org, candidate, assessment, config_row = _setup(
            db_session, coordinator=True
        )
        _site_of(db_session, org, "Ward 1")

        elsewhere = _org(db_session, "Other Trust")
        their_site = _site_of(db_session, elsewhere, "Their Ward")
        their_lead = _user(db_session, "dr_other", "other@example.test")
        _make_lead(db_session, their_site, their_lead)

        assert _run(db_session, assessment, config_row, candidate) == []

    def test_the_role_column_alone_no_longer_names_a_lead(self, db_session):
        """The cut-over, pinned.

        Before the lookup moved, a `clinical_lead` row here was enough to
        get someone emailed. It is not any more: the post is the source of
        truth, and a site whose post is empty emails nobody.
        """
        org, candidate, assessment, config_row = _setup(
            db_session, coordinator=True
        )
        site = _site_of(db_session, org, "Ward 1")
        impostor = _user(db_session, "dr_column_only", "column@example.test")
        db_session.execute(
            insert(site_member).values(
                site_id=site.id,
                user_id=impostor.id,
                capacity="staff",
            )
        )
        db_session.commit()

        assert _run(db_session, assessment, config_row, candidate) == []

    def test_a_lead_without_an_address_is_skipped(self, db_session):
        org, candidate, assessment, config_row = _setup(
            db_session, coordinator=True
        )
        site = _site_of(db_session, org, "Ward 1")
        lead = _user(db_session, "dr_no_email", "")
        _make_lead(db_session, site, lead)

        assert _run(db_session, assessment, config_row, candidate) == []


class TestBoth:
    """Both flags together."""

    def test_candidate_and_lead_are_both_emailed(self, db_session):
        org, candidate, assessment, config_row = _setup(
            db_session, student=True, coordinator=True
        )
        site = _site_of(db_session, org, "Ward 1")
        lead = _user(db_session, "dr_lead", "lead@example.test")
        _make_lead(db_session, site, lead)

        assert sorted(_run(db_session, assessment, config_row, candidate)) == [
            "candidate@example.test",
            "lead@example.test",
        ]
