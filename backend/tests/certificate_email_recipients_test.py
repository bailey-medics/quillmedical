"""Tests for who is emailed when a candidate passes.

``_maybe_enqueue_certificate_emails`` decides this, and had no test at all.
That was found the hard way: a change to it referenced a name it had not
imported, the module still imported because Python resolves the name only
when the function runs, and the whole suite passed either way. The bug
would have shipped and surfaced as a certificate email that never arrived.

The clinical lead told is the one at the site the candidate is at,
beneath the organisation that served the module, and no other. Until
2026-10-16 it was every lead beneath the organisation, which the E2E
leak tests found telling one site's lead of another site's delegates.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi import BackgroundTasks
from sqlalchemy import insert, update
from sqlalchemy.orm import Session

from app.cbac.positions import set_clinical_lead
from app.email_send import EmailRateLimitError
from app.features.teaching.models import (
    Assessment,
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.features.teaching.router import (
    _maybe_enqueue_certificate_emails,
    _send_certificate_email,
)
from app.models import (
    OrgUnit,
    User,
    org_unit_member,
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
    )
    db.add(user)
    db.commit()

    return user


def _org(db: Session, name: str) -> OrgUnit:
    org = OrgUnit(name=name, type="organisation")
    db.add(org)
    db.commit()

    return org


def _site_of(db: Session, org: OrgUnit, name: str) -> OrgUnit:
    site = OrgUnit(name=name, type="ward")
    db.add(site)
    db.commit()
    db.execute(
        update(OrgUnit).where(OrgUnit.id == site.id).values(parent_id=org.id)
    )
    db.commit()

    return site


def _make_lead(db: Session, site: OrgUnit, user: User) -> None:
    """Make someone the clinical lead, the way the API does.

    Both the post and the role column are written while the column still
    exists. The post is what the lookup reads; the column is written until
    the contract step removes it.
    """
    db.execute(
        insert(org_unit_member).values(
            org_unit_id=site.id,
            user_id=user.id,
            capacity="staff",
        )
    )
    set_clinical_lead(db, site, user)
    db.commit()


def _put_at(db: Session, site: OrgUnit, user: User) -> None:
    """Make *user* a member of *site*: the site they are at."""
    db.execute(
        insert(org_unit_member).values(
            org_unit_id=site.id,
            user_id=user.id,
            capacity="staff",
        )
    )
    db.commit()


def _setup(
    db: Session,
    *,
    student: bool = False,
    coordinator: bool = False,
    is_live: bool = True,
) -> tuple[OrgUnit, User, Assessment, QuestionBankConfig]:
    org = _org(db, "Trust")
    candidate = _user(db, "candidate", "candidate@example.test")

    config_row = QuestionBankConfig(
        org_unit_id=org.id,
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
            org_unit_id=org.id,
            question_bank_id=BANK_ID,
            is_live=is_live,
            active_version=1,
        )
    )
    db.commit()

    assessment = Assessment(
        user_id=candidate.id,
        org_unit_id=org.id,
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
    """The coordinator email: the lead of the candidate's own site."""

    def test_the_lead_of_the_candidates_site_is_emailed(self, db_session):
        org, candidate, assessment, config_row = _setup(
            db_session, coordinator=True
        )
        site = _site_of(db_session, org, "Ward 1")
        _put_at(db_session, site, candidate)
        lead = _user(db_session, "dr_lead", "lead@example.test")
        _make_lead(db_session, site, lead)

        assert _run(db_session, assessment, config_row, candidate) == [
            "lead@example.test"
        ]

    def test_the_lead_of_another_site_of_the_organisation_is_not(
        self, db_session
    ):
        """The leak the E2E tests found: one site told of another's."""
        org, candidate, assessment, config_row = _setup(
            db_session, coordinator=True
        )
        theirs = _site_of(db_session, org, "Ward 1")
        _put_at(db_session, theirs, candidate)
        _make_lead(
            db_session,
            theirs,
            _user(db_session, "dr_lead", "lead@example.test"),
        )
        next_door = _site_of(db_session, org, "Ward 2")
        _make_lead(
            db_session,
            next_door,
            _user(db_session, "dr_next_door", "next-door@example.test"),
        )

        assert _run(db_session, assessment, config_row, candidate) == [
            "lead@example.test"
        ]

    def test_a_candidate_at_no_site_emails_no_lead(self, db_session):
        """Belonging to the organisation alone names no site's lead."""
        org, candidate, assessment, config_row = _setup(
            db_session, coordinator=True
        )
        site = _site_of(db_session, org, "Ward 1")
        _make_lead(
            db_session, site, _user(db_session, "dr_lead", "lead@example.test")
        )

        assert _run(db_session, assessment, config_row, candidate) == []

    def test_a_vacant_post_at_their_site_is_not_filled_from_next_door(
        self, db_session
    ):
        org, candidate, assessment, config_row = _setup(
            db_session, coordinator=True
        )
        theirs = _site_of(db_session, org, "Ward 1")
        _put_at(db_session, theirs, candidate)
        next_door = _site_of(db_session, org, "Ward 2")
        _make_lead(
            db_session,
            next_door,
            _user(db_session, "dr_next_door", "next-door@example.test"),
        )

        assert _run(db_session, assessment, config_row, candidate) == []

    def test_nobody_is_emailed_when_the_post_is_empty(self, db_session):
        """The vacancy case, and the one most at risk in the move.

        A site with no clinical lead must produce no coordinator email,
        rather than an error or an email to the wrong person.
        """
        org, candidate, assessment, config_row = _setup(
            db_session, coordinator=True
        )
        _put_at(db_session, _site_of(db_session, org, "Ward 1"), candidate)

        assert _run(db_session, assessment, config_row, candidate) == []

    def test_a_lead_at_another_organisation_is_not_emailed(self, db_session):
        """Only sites linked to the assessment's organisation count."""
        org, candidate, assessment, config_row = _setup(
            db_session, coordinator=True
        )
        _put_at(db_session, _site_of(db_session, org, "Ward 1"), candidate)

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
        _put_at(db_session, site, candidate)
        impostor = _user(db_session, "dr_column_only", "column@example.test")
        db_session.execute(
            insert(org_unit_member).values(
                org_unit_id=site.id,
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
        _put_at(db_session, site, candidate)
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
        _put_at(db_session, site, candidate)
        lead = _user(db_session, "dr_lead", "lead@example.test")
        _make_lead(db_session, site, lead)

        assert sorted(_run(db_session, assessment, config_row, candidate)) == [
            "candidate@example.test",
            "lead@example.test",
        ]


def _sent(
    db: Session,
    assessment: Assessment,
    config_row: QuestionBankConfig,
    user: User,
) -> list[dict[str, Any]]:
    """Call the function and return the send_email arguments it queued."""
    tasks = BackgroundTasks()
    _maybe_enqueue_certificate_emails(
        background_tasks=tasks,
        assessment=assessment,
        config_row=config_row,
        user=user,
        db=db,
        criteria_results=[{"name": "Accuracy", "value": 0.9}],
    )

    return [dict(t.kwargs) for t in tasks.tasks]


class TestTheEmailIsBranded:
    """The coordinator's words, inside Quill's layout, sent for the partner."""

    def test_without_teaching_settings_it_goes_out_as_quill(self, db_session):
        _org_, candidate, assessment, config_row = _setup(
            db_session, student=True
        )

        [sent] = _sent(db_session, assessment, config_row, candidate)
        assert sent["subject"] == "You passed"
        assert sent["from_name"] == "Quill Medical"
        assert sent["reply_to"] is None
        assert "Quill Medical is a trade name" in sent["html_body"]
        assert sent["text_body"].startswith("Well done")

    def test_a_partner_gets_the_strip_the_sender_line_and_replies(
        self, db_session
    ):
        from app.features.teaching.models import TeachingOrgSettings

        org, candidate, assessment, config_row = _setup(
            db_session, student=True
        )
        db_session.add(
            TeachingOrgSettings(
                org_unit_id=org.id,
                coordinator_email="coordinator@partner.example",
                institution_name="East of England Endoscopy Training Academy",
                email_short_name="EoEETA",
                email_logo="eoeeta-email.png",
                email_logo_width=162,
            )
        )
        db_session.commit()

        [sent] = _sent(db_session, assessment, config_row, candidate)
        assert sent["from_name"] == "EoEETA via Quill Medical"
        assert sent["reply_to"] == "coordinator@partner.example"
        assert "/email/partners/eoeeta-email.png" in sent["html_body"]
        assert 'width="162"' in sent["html_body"]
        assert 'height="72"' in sent["html_body"]
        assert (
            "Sent by Quill Medical on behalf of East of England Endoscopy "
            "Training Academy." in sent["html_body"]
        )

    def test_the_coordinators_markup_is_not_escaped_twice(self, db_session):
        _org_, candidate, assessment, config_row = _setup(
            db_session, student=True
        )

        [sent] = _sent(db_session, assessment, config_row, candidate)
        assert "<p>Well done" in sent["html_body"]
        assert "&lt;p&gt;" not in sent["html_body"]


class TestOneRefusedEmailStopsNoOther:
    """Each certificate email is its own background task.

    Starlette runs a request's background tasks in turn and stops at the
    first that raises. So an email refused for its address, an hourly
    allowance run out, must be caught, or everybody queued after it gets
    nothing.
    """

    def test_a_refused_email_is_logged_not_raised(
        self, monkeypatch, caplog
    ) -> None:
        def refuse(**_kwargs: Any) -> None:
            raise EmailRateLimitError("limited")

        monkeypatch.setattr("app.email_send.send_email", refuse)

        with caplog.at_level("WARNING", logger="app.features.teaching.router"):
            _send_certificate_email(to="lead@example.com", subject="s")

        assert "address rate limited" in caplog.text
        assert "lead@example.com" not in caplog.text

    @pytest.mark.anyio
    async def test_the_emails_after_a_refused_one_still_go(
        self, monkeypatch
    ) -> None:
        sent: list[str] = []

        def send(*, to: str, **_kwargs: Any) -> None:
            if to == "over-the-limit@example.com":
                raise EmailRateLimitError("limited")
            sent.append(to)

        monkeypatch.setattr("app.email_send.send_email", send)
        tasks = BackgroundTasks()
        for address in (
            "over-the-limit@example.com",
            "lead-two@example.com",
            "lead-three@example.com",
        ):
            tasks.add_task(_send_certificate_email, to=address)

        await tasks()

        assert sent == ["lead-two@example.com", "lead-three@example.com"]


class TestALeadIsSentEveryCopy:
    """A cohort passing together reaches its lead in full.

    ``send_email`` lets one address receive ten emails an hour, and every
    pass sends the lead a copy, so the eleventh pass in an hour used to be
    logged and dropped. The lead's copy is now sent outside that limit;
    the candidate's own email keeps it.
    """

    @pytest.fixture
    def captured(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> Path:
        """Send for real, in dry run, writing each email to a folder."""
        from app import email_send

        email_send._rate_log.clear()
        monkeypatch.setattr(email_send.settings, "EMAIL_DRY_RUN", True)
        monkeypatch.setattr(
            email_send.settings, "EMAIL_CAPTURE_DIR", str(tmp_path)
        )
        monkeypatch.setattr(
            email_send.settings, "EMAIL_ALLOWED_RECIPIENTS", ""
        )

        return tmp_path

    @staticmethod
    def _sent_to(folder: Path, address: str) -> int:
        return sum(
            1
            for path in folder.glob("*.json")
            if json.loads(path.read_text())["to"] == address
        )

    @pytest.mark.anyio
    async def test_eleven_passes_in_an_hour_send_the_lead_eleven_copies(
        self, db_session, captured: Path
    ) -> None:
        org, candidate, assessment, config_row = _setup(
            db_session, coordinator=True
        )
        site = _site_of(db_session, org, "Ward 1")
        _put_at(db_session, site, candidate)
        _make_lead(
            db_session, site, _user(db_session, "dr_lead", "lead@example.test")
        )

        for _ in range(11):
            tasks = BackgroundTasks()
            _maybe_enqueue_certificate_emails(
                background_tasks=tasks,
                assessment=assessment,
                config_row=config_row,
                user=candidate,
                db=db_session,
                criteria_results=[{"name": "Accuracy", "value": 0.9}],
            )
            await tasks()

        assert self._sent_to(captured, "lead@example.test") == 11

    @pytest.mark.anyio
    async def test_a_candidate_at_the_limit_is_still_refused(
        self, db_session, captured: Path
    ) -> None:
        import time

        from app import email_send

        org, candidate, assessment, config_row = _setup(
            db_session, student=True, coordinator=True
        )
        site = _site_of(db_session, org, "Ward 1")
        _put_at(db_session, site, candidate)
        _make_lead(
            db_session, site, _user(db_session, "dr_lead", "lead@example.test")
        )
        email_send._rate_log["candidate@example.test"] = [time.time()] * 10

        tasks = BackgroundTasks()
        _maybe_enqueue_certificate_emails(
            background_tasks=tasks,
            assessment=assessment,
            config_row=config_row,
            user=candidate,
            db=db_session,
            criteria_results=[{"name": "Accuracy", "value": 0.9}],
        )
        await tasks()

        assert self._sent_to(captured, "candidate@example.test") == 0
        assert self._sent_to(captured, "lead@example.test") == 1


class TestTheOperatorIsToldWhenNoLeadIs:
    """A pass that reaches no clinical lead is told to the operator.

    At the addresses in ``FEEDBACK_NOTIFY_EMAIL``, so somebody can name a
    lead or send the certificate on. Phase 19 of the teaching E2E
    coverage plan.
    """

    OPERATOR = "operator@example.test"

    @pytest.fixture(autouse=True)
    def operator_address(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(
            "app.config.settings.FEEDBACK_NOTIFY_EMAIL", self.OPERATOR
        )

    @staticmethod
    def _notices(sent: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [task for task in sent if "context" in task]

    def test_a_site_with_no_lead(self, db_session) -> None:
        org, candidate, assessment, config_row = _setup(
            db_session, coordinator=True
        )
        site = _site_of(db_session, org, "Ward 1")
        _put_at(db_session, site, candidate)

        [notice] = self._notices(
            _sent(db_session, assessment, config_row, candidate)
        )

        assert notice["to"] == self.OPERATOR
        assert notice["context"]["username"] == "candidate"
        assert notice["context"]["site"] == "Ward 1"
        assert notice["context"]["reason"] == "Ward 1 has no clinical lead."
        assert notice["context"]["url"].endswith(f"/admin/sites/{site.id}")

    def test_a_lead_with_no_address(self, db_session) -> None:
        org, candidate, assessment, config_row = _setup(
            db_session, coordinator=True
        )
        site = _site_of(db_session, org, "Ward 1")
        _put_at(db_session, site, candidate)
        _make_lead(db_session, site, _user(db_session, "dr_no_email", ""))

        [notice] = self._notices(
            _sent(db_session, assessment, config_row, candidate)
        )

        assert notice["context"]["reason"] == (
            "The clinical lead of Ward 1 has no email address."
        )

    def test_a_delegate_at_no_site(self, db_session) -> None:
        _org, candidate, assessment, config_row = _setup(
            db_session, coordinator=True
        )

        [notice] = self._notices(
            _sent(db_session, assessment, config_row, candidate)
        )

        assert notice["context"]["site"] is None
        assert notice["context"]["url"].endswith(
            f"/admin/users/{candidate.id}"
        )

    def test_nobody_is_told_when_a_lead_was(self, db_session) -> None:
        org, candidate, assessment, config_row = _setup(
            db_session, coordinator=True
        )
        site = _site_of(db_session, org, "Ward 1")
        _put_at(db_session, site, candidate)
        _make_lead(
            db_session, site, _user(db_session, "dr_lead", "lead@example.test")
        )

        sent = _sent(db_session, assessment, config_row, candidate)

        assert self._notices(sent) == []
        assert [task["to"] for task in sent] == ["lead@example.test"]

    def test_nobody_is_told_with_no_address_configured(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("app.config.settings.FEEDBACK_NOTIFY_EMAIL", "")
        _org, candidate, assessment, config_row = _setup(
            db_session, coordinator=True
        )

        assert _sent(db_session, assessment, config_row, candidate) == []

    def test_nobody_is_told_when_the_module_emails_no_coordinator(
        self, db_session
    ) -> None:
        _org, candidate, assessment, config_row = _setup(
            db_session, student=True
        )

        sent = _sent(db_session, assessment, config_row, candidate)

        assert self._notices(sent) == []
