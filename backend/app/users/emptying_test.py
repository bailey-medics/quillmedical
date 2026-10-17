"""Emptying a closed account: what goes, what stays, and who is refused."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.features.passport.models import (
    Passport,
    PassportAssessorInvite,
    PassportSignOffRequest,
)
from app.features.teaching.models import ModuleEnrolment
from app.marketing.preferences import set_marketing_preference
from app.models import (
    Conversation,
    Feedback,
    MarketingPreferenceChange,
    Message,
    NewsletterSend,
    NewsletterSubscriber,
    OrgUnit,
    PractisingCompetency,
    ProfessionalRegistration,
    PushSubscription,
    RetentionReview,
    Role,
    User,
    UserCompetency,
    org_unit_member,
    user_role,
)
from app.organisations import add_org_unit_member
from app.security import hash_password, verify_password
from app.users.emptying import (
    COLUMN_RULES,
    CannotEmpty,
    empty_account,
    placeholder_email,
    placeholder_username,
    why_it_cannot_be_emptied,
)

NOW = datetime(2030, 6, 1, 12, 0, tzinfo=UTC)
PASSWORD = "Password123!"
PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"
OTHER_PASSPORT_ID = "9b1d5a7f3093f2a8c1e4b7d49f0a6c2e"


def _person(db: Session, name: str, *, closed: bool = True) -> User:
    user = User(
        username=name,
        email=f"{name}@example.nhs.uk",
        full_name=f"{name.title()} Example",
        password_hash=hash_password(PASSWORD),
        email_verified=True,
        base_profession="consultant",
        totp_secret="JBSWY3DPEHPK3PXP",
        is_totp_enabled=True,
        totp_last_step=59_000_000,
        fhir_patient_id=f"patient-{name}",
        marketing_emails=True,
    )
    db.add(user)
    db.flush()

    if closed:
        user.is_active = False
        db.flush()

    return user


def _count(db: Session, model: type, **where: object) -> int:
    query = select(func.count()).select_from(model)

    for column, value in where.items():
        query = query.where(getattr(model, column) == value)

    return db.scalar(query) or 0


def _no_archive(passport_id: str) -> list[str]:
    raise AssertionError(f"asked to archive {passport_id}")


@pytest.fixture
def org(db_session: Session) -> OrgUnit:
    unit = OrgUnit(name="Academy", type="hospital_team")
    db_session.add(unit)
    db_session.flush()

    return unit


@pytest.fixture
def ada(db_session: Session, org: OrgUnit) -> User:
    """Closed, and holding one of everything an account can hold."""
    user = _person(db_session, "ada", closed=False)
    # Not the default, so that wiping it shows.
    user.platform_role = "superadmin"
    add_org_unit_member(db_session, org.id, user.id, "staff")
    role = Role(name="Clinician")
    db_session.add(role)
    user.roles.append(role)
    set_marketing_preference(db_session, user, wants=False, source="settings")
    set_marketing_preference(db_session, user, wants=True, source="settings")
    db_session.add_all(
        [
            ProfessionalRegistration(
                user_id=user.id, authority="GMC", number="7654321"
            ),
            PractisingCompetency(
                user_id=user.id, org_unit_id=org.id, competency="manage_users"
            ),
            PushSubscription(
                user_id=user.id,
                endpoint="https://push.example/ada",
                keys_p256dh="p",
                keys_auth="a",
            ),
            NewsletterSend(campaign="autumn", user_id=user.id),
            Feedback(
                user_id=user.id,
                category="broken",
                message="It broke",
                route="/teaching",
                release="abc1234",
                viewport="390x844",
                user_agent="Mozilla/5.0",
                breadcrumbs=[],
                status="new",
            ),
        ]
    )
    user.is_active = False
    db_session.commit()

    return user


class TestEveryColumnIsAccountedFor:
    def test_every_column_of_users_says_what_emptying_does_with_it(
        self,
    ) -> None:
        """A new column is otherwise kept by default, and nobody notices."""
        columns = set(User.__table__.columns.keys())

        assert columns - set(COLUMN_RULES) == set(), (
            "Add each new users column to COLUMN_RULES in "
            "app/users/emptying.py, saying whether emptying wipes it, and "
            "wipe it in _wipe_the_row if so."
        )
        assert set(COLUMN_RULES) - columns == set()

    def test_every_column_marked_wiped_is_changed(
        self, db_session: Session, ada: User
    ) -> None:
        before = {name: getattr(ada, name) for name in COLUMN_RULES}

        empty_account(db_session, ada, now=NOW, archive=_no_archive)

        for name, rule in COLUMN_RULES.items():
            if rule == "wiped":
                assert getattr(ada, name) != before[name], name

    def test_every_column_marked_kept_is_left(
        self, db_session: Session, ada: User
    ) -> None:
        before = {name: getattr(ada, name) for name in COLUMN_RULES}

        empty_account(db_session, ada, now=NOW, archive=_no_archive)

        for name, rule in COLUMN_RULES.items():
            if rule == "kept" and name != "emptied_at":
                assert getattr(ada, name) == before[name], name


class TestTheRow:
    def test_nothing_on_it_says_who_it_was(
        self, db_session: Session, ada: User
    ) -> None:
        empty_account(db_session, ada, now=NOW, archive=_no_archive)
        db_session.commit()
        db_session.expire_all()

        assert ada.username == placeholder_username(ada.id)
        assert ada.email == placeholder_email(ada.id)
        assert ada.full_name is None
        assert ada.totp_secret is None
        assert ada.is_totp_enabled is False
        assert ada.totp_last_step is None
        assert ada.fhir_patient_id is None
        assert ada.email_verified is False
        assert ada.marketing_emails is False
        assert ada.platform_role == "standard"
        # What kind of work they did could help identify them.
        assert ada.base_profession is None
        assert ada.is_active is False
        assert ada.emptied_at is not None

    def test_the_old_password_no_longer_opens_it(
        self, db_session: Session, ada: User
    ) -> None:
        empty_account(db_session, ada, now=NOW, archive=_no_archive)

        assert verify_password(PASSWORD, ada.password_hash) is False

    def test_a_session_still_out_there_is_refused(
        self, db_session: Session, ada: User
    ) -> None:
        version = ada.token_version

        empty_account(db_session, ada, now=NOW, archive=_no_archive)

        assert ada.token_version == version + 1

    def test_the_real_address_and_username_are_free_again(
        self, db_session: Session, ada: User
    ) -> None:
        empty_account(db_session, ada, now=NOW, archive=_no_archive)
        db_session.commit()

        again = _person(db_session, "ada", closed=False)
        db_session.commit()

        assert again.id != ada.id

    def test_two_emptied_accounts_do_not_collide(
        self, db_session: Session, ada: User
    ) -> None:
        bob = _person(db_session, "bob")

        empty_account(db_session, ada, now=NOW, archive=_no_archive)
        empty_account(db_session, bob, now=NOW, archive=_no_archive)
        db_session.commit()

        assert ada.email != bob.email
        assert ada.username != bob.username


class TestWhatTheyHeld:
    def test_all_of_it_is_deleted(
        self, db_session: Session, ada: User
    ) -> None:
        empty_account(db_session, ada, now=NOW, archive=_no_archive)
        db_session.commit()

        for model in (
            UserCompetency,
            ProfessionalRegistration,
            PractisingCompetency,
            PushSubscription,
            MarketingPreferenceChange,
            NewsletterSend,
        ):
            assert _count(db_session, model, user_id=ada.id) == 0, model

        for table in (org_unit_member, user_role):
            held = db_session.scalar(
                select(func.count())
                .select_from(table)
                .where(table.c.user_id == ada.id)
            )
            assert held == 0, table.name

    def test_their_feedback_stays_with_no_name_on_it(
        self, db_session: Session, ada: User
    ) -> None:
        empty_account(db_session, ada, now=NOW, archive=_no_archive)
        db_session.commit()

        [feedback] = db_session.scalars(select(Feedback)).all()
        assert feedback.user_id is None
        assert feedback.message == "It broke"

    def test_the_next_person_keeps_everything(
        self, db_session: Session, ada: User, org: OrgUnit
    ) -> None:
        bob = _person(db_session, "bob", closed=False)
        add_org_unit_member(db_session, org.id, bob.id, "staff")
        db_session.add(
            ProfessionalRegistration(
                user_id=bob.id, authority="GMC", number="1234567"
            )
        )
        db_session.commit()
        held = len(bob.competency_grants)

        empty_account(db_session, ada, now=NOW, archive=_no_archive)
        db_session.commit()
        db_session.expire_all()

        assert bob.full_name == "Bob Example"
        assert len(bob.competency_grants) == held
        assert len(bob.registrations) == 1
        assert (
            db_session.scalar(
                select(func.count())
                .select_from(org_unit_member)
                .where(org_unit_member.c.user_id == bob.id)
            )
            == 1
        )

    def test_their_place_on_the_newsletter_list_stays(
        self, db_session: Session, ada: User
    ) -> None:
        """Closing the account put it there to outlive the account."""
        db_session.add(
            NewsletterSubscriber(email=ada.email, name=ada.full_name)
        )
        db_session.commit()

        empty_account(db_session, ada, now=NOW, archive=_no_archive)
        db_session.commit()

        [entry] = db_session.scalars(select(NewsletterSubscriber)).all()
        assert entry.email == "ada@example.nhs.uk"


class TestWhatBelongsToSomebodyElse:
    def test_a_message_they_sent_stays(
        self, db_session: Session, ada: User
    ) -> None:
        conversation = Conversation(
            fhir_conversation_id="conv-1", patient_id="patient-1"
        )
        db_session.add(conversation)
        db_session.flush()
        db_session.add(
            Message(
                fhir_communication_id="comm-1",
                conversation_id=conversation.id,
                sender_id=ada.id,
                body="Seen in clinic.",
            )
        )
        db_session.commit()

        empty_account(db_session, ada, now=NOW, archive=_no_archive)
        db_session.commit()

        # ``unique()`` because a message loads its sender, and the
        # sender's roles, with a join.
        [message] = db_session.scalars(select(Message)).unique().all()
        assert message.sender_id == ada.id
        assert message.body == "Seen in clinic."

    def test_a_sign_off_they_gave_on_a_colleagues_passport_stays(
        self, db_session: Session, ada: User
    ) -> None:
        """The request row still names them. The name itself is in the
        colleague's passport files, written when it was signed."""
        colleague = _person(db_session, "cat", closed=False)
        db_session.add(Passport(id=OTHER_PASSPORT_ID, user_id=colleague.id))
        db_session.flush()
        db_session.add(
            PassportSignOffRequest(
                passport_id=OTHER_PASSPORT_ID,
                signoff_id="so-1",
                competency_id="perform_colonoscopy",
                assessor_email="ada@example.nhs.uk",
                assessor_user_id=ada.id,
                status="signed",
            )
        )
        db_session.commit()

        empty_account(db_session, ada, now=NOW, archive=_no_archive)
        db_session.commit()

        [request] = db_session.scalars(select(PassportSignOffRequest)).all()
        assert request.assessor_user_id == ada.id
        assert request.assessor_email == "ada@example.nhs.uk"
        assert _count(db_session, Passport) == 1

    def test_the_record_of_the_decision_stays(
        self, db_session: Session, ada: User
    ) -> None:
        db_session.add(
            RetentionReview(
                subject="account",
                user_id=ada.id,
                closed_at=NOW,
                due_on=NOW,
                attempts=0,
                enrolments=0,
                decision="deleted",
            )
        )
        db_session.commit()

        empty_account(db_session, ada, now=NOW, archive=_no_archive)
        db_session.commit()

        assert _count(db_session, RetentionReview, user_id=ada.id) == 1


class TestTheirOwnPassport:
    @pytest.fixture
    def with_passport(self, db_session: Session, ada: User) -> User:
        db_session.add(Passport(id=PASSPORT_ID, user_id=ada.id))
        db_session.flush()
        db_session.add_all(
            [
                PassportSignOffRequest(
                    passport_id=PASSPORT_ID,
                    signoff_id="so-1",
                    competency_id="perform_colonoscopy",
                    assessor_email="assessor@example.nhs.uk",
                    status="pending",
                ),
                PassportAssessorInvite(
                    id="invite-1",
                    passport_id=PASSPORT_ID,
                    invited_by_user_id=ada.id,
                    email="assessor@example.nhs.uk",
                    token_hash="hash",
                    expires_at=NOW,
                ),
            ]
        )
        db_session.commit()

        return ada

    def test_its_rows_go_and_its_files_are_archived(
        self, db_session: Session, with_passport: User
    ) -> None:
        asked: list[str] = []

        def archive(passport_id: str) -> list[str]:
            asked.append(passport_id)

            return ["bundle", "evidence-1"]

        done = empty_account(
            db_session, with_passport, now=NOW, archive=archive
        )
        db_session.commit()

        assert asked == [PASSPORT_ID]
        assert done.passport_objects == 2
        assert _count(db_session, Passport) == 0
        assert _count(db_session, PassportSignOffRequest) == 0
        assert _count(db_session, PassportAssessorInvite) == 0

    def test_with_nowhere_to_archive_it_nothing_is_changed(
        self, db_session: Session, with_passport: User
    ) -> None:
        with pytest.raises(CannotEmpty, match="no archive"):
            empty_account(db_session, with_passport, now=NOW, archive=None)

        db_session.rollback()
        assert with_passport.full_name == "Ada Example"
        assert with_passport.emptied_at is None
        assert _count(db_session, Passport) == 1
        assert _count(db_session, UserCompetency, user_id=with_passport.id)

    def test_the_files_move_only_after_everything_else_is_done(
        self, db_session: Session, with_passport: User
    ) -> None:
        """So a failure in the database is found before a file moves."""
        seen: dict[str, object] = {}

        def archive(_passport_id: str) -> list[str]:
            seen["full_name"] = with_passport.full_name
            seen["passports"] = _count(db_session, Passport)

            return []

        empty_account(db_session, with_passport, now=NOW, archive=archive)

        assert seen == {"full_name": None, "passports": 0}

    def test_somebody_with_no_passport_needs_no_archive(
        self, db_session: Session, ada: User
    ) -> None:
        done = empty_account(db_session, ada, now=NOW, archive=None)

        assert done.passport_objects == 0
        assert ada.emptied_at is not None


class TestWhoIsRefused:
    def test_an_open_account(self, db_session: Session) -> None:
        user = _person(db_session, "ada", closed=False)

        with pytest.raises(CannotEmpty, match="open"):
            empty_account(db_session, user, now=NOW, archive=None)

        assert user.full_name == "Ada Example"

    def test_one_that_still_has_training_records(
        self, db_session: Session, ada: User, org: OrgUnit
    ) -> None:
        db_session.add(
            ModuleEnrolment(
                user_id=ada.id,
                org_unit_id=org.id,
                question_bank_id="colonoscopy-optical-diagnosis",
                starts_on=NOW,
                source="admin",
            )
        )
        db_session.commit()

        with pytest.raises(CannotEmpty, match="training records"):
            empty_account(db_session, ada, now=NOW, archive=None)

        assert ada.full_name == "Ada Example"
        assert _count(db_session, ModuleEnrolment) == 1

    def test_one_already_empty(self, db_session: Session, ada: User) -> None:
        empty_account(db_session, ada, now=NOW, archive=None)
        db_session.commit()

        with pytest.raises(CannotEmpty, match="already empty"):
            empty_account(db_session, ada, now=NOW, archive=None)

    def test_the_reason_names_nobody(
        self, db_session: Session, ada: User
    ) -> None:
        ada.is_active = True
        db_session.flush()

        reason = why_it_cannot_be_emptied(db_session, ada)

        assert reason is not None
        assert "ada" not in reason.lower()
