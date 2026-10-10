"""Who may start, read, write to and join a conversation about a patient."""

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from itertools import count
from typing import Any

import pytest
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import messaging
from app.messaging import (
    AmendedMessageInAnotherConversation,
    AmendedMessageNotFound,
    CanOnlyAmendOwnMessages,
    ConversationNotFound,
    LacksPatientRecordCompetency,
    MessagingError,
    NotAParticipant,
    NotInMessageOrganisation,
    NotInPatientOrganisation,
    SingleUserCannotSelfJoin,
    UserNotFound,
    add_participant,
    create_conversation,
    get_conversation_detail,
    join_conversation,
    list_conversations,
    list_patient_conversations,
    mark_conversation_read,
    send_message,
)
from app.models import (
    Conversation,
    ConversationParticipant,
    ExternalPatientAccess,
    Message,
    OrgUnit,
    User,
    message_org_unit,
    org_unit_patient_member,
)
from app.organisations import add_org_unit_member

PATIENT = "patient-fhir-123"
OTHER_PATIENT = "patient-fhir-456"

#: Long past, so a row stamped "now" by the database is later than all of it.
START = datetime(2026, 1, 5, 9, 0, tzinfo=UTC)

#: Holds ``access_patient_records``: may read the patients of their own
#: organisations.
STAFF = "registered_nurse"

#: Holds ``access_granted_patient_records``: may read a patient they hold
#: a grant for.
EXTERNAL = "external_hcp"

#: Holds neither.
NO_RECORDS = "superadmin_profession"

_fhir_ids = count(1)


def _at(minutes: int) -> datetime:
    return START + timedelta(minutes=minutes)


def _settle(db: Session) -> None:
    """Flush, then forget what is loaded, as the end of a request does.

    SQLite hands a time back without its zone, so a row still held from
    before the flush and one read afterwards cannot be compared. Reading
    everything back makes them all alike.
    """
    db.flush()
    db.expire_all()


def _user(
    db: Session,
    username: str,
    *,
    profession: str = STAFF,
    full_name: str | None = None,
    fhir_patient_id: str | None = None,
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.com",
        full_name=full_name,
        password_hash="x",
        is_active=True,
        email_verified=True,
        base_profession=profession,
        fhir_patient_id=fhir_patient_id,
    )
    db.add(user)
    db.flush()

    return user


def _organisation(db: Session, name: str) -> OrgUnit:
    place = OrgUnit(name=name, type="hospital_team")
    db.add(place)
    db.flush()

    return place


def _admit(db: Session, place: OrgUnit, patient_id: str) -> None:
    db.execute(
        org_unit_patient_member.insert().values(
            org_unit_id=place.id, patient_id=patient_id
        )
    )


def _grant(
    db: Session,
    user: User,
    patient_id: str,
    *,
    revoked_at: datetime | None = None,
) -> None:
    db.add(
        ExternalPatientAccess(
            user_id=user.id,
            patient_id=patient_id,
            granted_by_user_id=user.id,
            revoked_at=revoked_at,
        )
    )
    db.flush()


def _conversation(
    db: Session,
    *,
    patient_id: str = PATIENT,
    places: Sequence[OrgUnit] = (),
    participants: Sequence[User] = (),
    status: str = "new",
    updated_at: datetime = START,
) -> Conversation:
    conv = Conversation(
        fhir_conversation_id=f"thread-{next(_fhir_ids)}",
        patient_id=patient_id,
        status=status,
        created_at=START,
        updated_at=updated_at,
    )
    conv.places.extend(places)
    db.add(conv)
    db.flush()

    for user in participants:
        db.add(
            ConversationParticipant(conversation_id=conv.id, user_id=user.id)
        )

    _settle(db)

    return conv


def _message(
    db: Session,
    conv: Conversation,
    sender: User,
    *,
    minutes: int = 0,
    body: str = "Bloods are back",
) -> Message:
    msg = Message(
        fhir_communication_id=f"seeded-{next(_fhir_ids)}",
        conversation_id=conv.id,
        sender_id=sender.id,
        body=body,
        created_at=_at(minutes),
    )
    db.add(msg)
    _settle(db)

    return msg


def _taking_part(db: Session, conv: Conversation) -> dict[int, str]:
    """Each participant's role, by user id."""
    rows = db.execute(
        select(
            ConversationParticipant.user_id, ConversationParticipant.role
        ).where(ConversationParticipant.conversation_id == conv.id)
    ).all()

    return {row.user_id: row.role for row in rows}


def _read_at(
    db: Session, conv: Conversation, user: User, when: datetime
) -> None:
    """Record that *user* last opened *conv* at *when*."""
    db.execute(
        update(ConversationParticipant)
        .where(
            ConversationParticipant.conversation_id == conv.id,
            ConversationParticipant.user_id == user.id,
        )
        .values(last_read_at=when)
    )
    _settle(db)


def _last_read(db: Session, conv: Conversation, user: User) -> datetime | None:
    return db.scalar(
        select(ConversationParticipant.last_read_at).where(
            ConversationParticipant.conversation_id == conv.id,
            ConversationParticipant.user_id == user.id,
        )
    )


def _places_of(db: Session, conversation_id: int) -> set[int]:
    rows = db.execute(
        select(message_org_unit.c.org_unit_id).where(
            message_org_unit.c.conversation_id == conversation_id
        )
    ).all()

    return {row.org_unit_id for row in rows}


@pytest.fixture
def fhir(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Stand in for the FHIR server, keeping what each write was given."""
    written: list[dict[str, Any]] = []

    def create(**fields: Any) -> dict[str, Any]:
        written.append(fields)

        return {"resourceType": "Communication", "id": f"comm-{len(written)}"}

    monkeypatch.setattr(messaging, "create_fhir_communication", create)

    return written


@pytest.fixture
def hospital(db_session: Session) -> OrgUnit:
    """An organisation that cares for ``PATIENT``."""
    place = _organisation(db_session, "Test Hospital")
    _admit(db_session, place, PATIENT)

    return place


@pytest.fixture
def nurse(db_session: Session, hospital: OrgUnit) -> User:
    """Staff at the hospital, who may read its patients' records."""
    user = _user(db_session, "nurse", full_name="Sam Patel")
    add_org_unit_member(db_session, hospital.id, user.id, "staff")
    db_session.flush()

    return user


@pytest.fixture
def colleague(db_session: Session, hospital: OrgUnit) -> User:
    """A second member of staff at the hospital, with no full name."""
    user = _user(db_session, "colleague")
    add_org_unit_member(db_session, hospital.id, user.id, "staff")
    db_session.flush()

    return user


# ---------------------------------------------------------------------------
# The errors
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("error", MessagingError.__subclasses__())
def test_an_error_says_only_what_its_class_fixed(
    error: type[MessagingError],
) -> None:
    """Nothing can be put into one, so nothing can leak out of one."""
    arguments = ["patient-fhir-123"]

    raised = error()

    assert str(raised) == error.message
    assert raised.args == (error.message,)
    assert 400 <= error.status_code < 500
    with pytest.raises(TypeError):
        error(*arguments)


def test_no_two_errors_share_a_code() -> None:
    codes = [error.error_code for error in MessagingError.__subclasses__()]

    assert len(codes) == len(set(codes))
    assert MessagingError.error_code not in codes


def test_the_retired_self_join_error_keeps_its_code() -> None:
    """A client may still be matching on it."""
    assert (
        SingleUserCannotSelfJoin.error_code == "single_user_cannot_self_join"
    )
    assert SingleUserCannotSelfJoin.status_code == 403


# ---------------------------------------------------------------------------
# Whose organisations a conversation belongs to
# ---------------------------------------------------------------------------


def test_snowballing_adds_each_of_a_users_organisations(
    db_session: Session, hospital: OrgUnit, nurse: User
) -> None:
    clinic = _organisation(db_session, "Clinic")
    add_org_unit_member(db_session, clinic.id, nurse.id, "staff")
    conv = _conversation(db_session)

    messaging._snowball_orgs(db_session, conv.id, nurse.id)

    assert _places_of(db_session, conv.id) == {hospital.id, clinic.id}


def test_snowballing_leaves_an_organisation_already_there_alone(
    db_session: Session, hospital: OrgUnit, nurse: User
) -> None:
    """A second row for the same pair would be refused by the table."""
    clinic = _organisation(db_session, "Clinic")
    add_org_unit_member(db_session, clinic.id, nurse.id, "staff")
    conv = _conversation(db_session, places=[hospital])

    messaging._snowball_orgs(db_session, conv.id, nurse.id)
    messaging._snowball_orgs(db_session, conv.id, nurse.id)

    assert _places_of(db_session, conv.id) == {hospital.id, clinic.id}


def test_snowballing_somebody_in_no_organisation_changes_nothing(
    db_session: Session, hospital: OrgUnit
) -> None:
    drifter = _user(db_session, "drifter")
    conv = _conversation(db_session, places=[hospital])

    messaging._snowball_orgs(db_session, conv.id, drifter.id)

    assert _places_of(db_session, conv.id) == {hospital.id}


def test_snowballing_touches_no_other_conversation(
    db_session: Session, nurse: User
) -> None:
    conv = _conversation(db_session)
    other = _conversation(db_session)

    messaging._snowball_orgs(db_session, conv.id, nurse.id)

    assert _places_of(db_session, other.id) == set()


# ---------------------------------------------------------------------------
# Reading without taking part
# ---------------------------------------------------------------------------


def _conversation_at(*org_unit_ids: int) -> Conversation:
    """A conversation about ``PATIENT`` at those places, never stored."""
    conv = Conversation(fhir_conversation_id="thread", patient_id=PATIENT)

    for org_unit_id in org_unit_ids:
        conv.places.append(
            OrgUnit(id=org_unit_id, name="Place", type="hospital_team")
        )

    return conv


@pytest.mark.parametrize(
    ("competencies", "org_unit_ids", "granted", "expected"),
    [
        pytest.param(
            ["access_patient_records"],
            {2, 9},
            set(),
            True,
            id="records competency and a shared organisation",
        ),
        pytest.param(
            ["access_granted_patient_records"],
            set(),
            {PATIENT, OTHER_PATIENT},
            True,
            id="granted competency and a grant for the patient",
        ),
        pytest.param(
            [],
            {1, 2},
            {PATIENT},
            False,
            id="both scopes and no competency",
        ),
        pytest.param(
            ["access_patient_records"],
            {9},
            set(),
            False,
            id="records competency at another organisation",
        ),
        pytest.param(
            ["access_patient_records"],
            set(),
            set(),
            False,
            id="records competency and no organisation",
        ),
        pytest.param(
            ["access_granted_patient_records"],
            set(),
            {OTHER_PATIENT},
            False,
            id="granted competency and a grant for another patient",
        ),
        pytest.param(
            ["access_patient_records"],
            set(),
            {PATIENT},
            False,
            id="records competency paired with a grant",
        ),
        pytest.param(
            ["access_granted_patient_records"],
            {1, 2},
            set(),
            False,
            id="granted competency paired with an organisation",
        ),
        pytest.param(
            ["access_own_patient_records", "manage_users"],
            {1, 2},
            {PATIENT},
            False,
            id="other competencies only",
        ),
        pytest.param(
            ["access_patient_records", "access_granted_patient_records"],
            {9},
            {PATIENT},
            True,
            id="both competencies and only the grant fits",
        ),
    ],
)
def test_reading_from_outside_needs_a_competency_and_its_own_scope(
    competencies: list[str],
    org_unit_ids: set[int],
    granted: set[str],
    expected: bool,
) -> None:
    conv = _conversation_at(1, 2)

    allowed = messaging._reads_without_taking_part(
        competencies, org_unit_ids, granted, conv
    )

    assert allowed is expected


def test_a_conversation_at_no_organisation_is_read_only_by_grant() -> None:
    conv = _conversation_at()

    by_organisation = messaging._reads_without_taking_part(
        ["access_patient_records"], {1, 2}, set(), conv
    )
    by_grant = messaging._reads_without_taking_part(
        ["access_granted_patient_records"], set(), {PATIENT}, conv
    )

    assert by_organisation is False
    assert by_grant is True


def test_somebody_with_no_grant_has_no_granted_patients(
    db_session: Session,
) -> None:
    external = _user(db_session, "external", profession=EXTERNAL)

    assert messaging._granted_patient_ids(db_session, external) == set()


def test_granted_patients_are_the_grants_not_revoked(
    db_session: Session,
) -> None:
    external = _user(db_session, "external", profession=EXTERNAL)
    _grant(db_session, external, PATIENT)
    _grant(db_session, external, "patient-fhir-789")
    _grant(db_session, external, OTHER_PATIENT, revoked_at=_at(0))

    found = messaging._granted_patient_ids(db_session, external)

    assert found == {PATIENT, "patient-fhir-789"}


def test_another_persons_grant_is_not_theirs(db_session: Session) -> None:
    external = _user(db_session, "external", profession=EXTERNAL)
    somebody_else = _user(db_session, "somebody_else", profession=EXTERNAL)
    _grant(db_session, somebody_else, PATIENT)

    assert messaging._granted_patient_ids(db_session, external) == set()


def test_a_participant_reads_whatever_they_hold(
    db_session: Session, hospital: OrgUnit
) -> None:
    """They were added by name, so they are not asked for a competency."""
    invited = _user(db_session, "invited", profession=NO_RECORDS)
    conv = _conversation(db_session, places=[hospital], participants=[invited])

    assert messaging._user_has_conversation_access(db_session, invited, conv)


def test_staff_at_the_conversations_organisation_read_from_outside(
    db_session: Session, hospital: OrgUnit, nurse: User
) -> None:
    conv = _conversation(db_session, places=[hospital])

    assert messaging._user_has_conversation_access(db_session, nurse, conv)


def test_a_member_without_the_records_competency_does_not_read(
    db_session: Session, hospital: OrgUnit
) -> None:
    operator = _user(db_session, "operator", profession=NO_RECORDS)
    add_org_unit_member(db_session, hospital.id, operator.id, "staff")
    conv = _conversation(db_session, places=[hospital])

    allowed = messaging._user_has_conversation_access(
        db_session, operator, conv
    )

    assert allowed is False


def test_staff_elsewhere_do_not_read(
    db_session: Session, hospital: OrgUnit
) -> None:
    clinic = _organisation(db_session, "Clinic")
    stranger = _user(db_session, "stranger")
    add_org_unit_member(db_session, clinic.id, stranger.id, "staff")
    conv = _conversation(db_session, places=[hospital])

    allowed = messaging._user_has_conversation_access(
        db_session, stranger, conv
    )

    assert allowed is False


@pytest.mark.parametrize(
    ("revoked_at", "expected"), [(None, True), (_at(0), False)]
)
def test_a_grant_admits_an_external_reader_until_it_is_revoked(
    db_session: Session,
    hospital: OrgUnit,
    revoked_at: datetime | None,
    expected: bool,
) -> None:
    external = _user(db_session, "external", profession=EXTERNAL)
    _grant(db_session, external, PATIENT, revoked_at=revoked_at)
    conv = _conversation(db_session, places=[hospital])

    allowed = messaging._user_has_conversation_access(
        db_session, external, conv
    )

    assert allowed is expected


# ---------------------------------------------------------------------------
# What is handed back
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("full_name", "expected"),
    [("Sam Patel", "Sam Patel"), (None, "sam.patel"), ("", "sam.patel")],
)
def test_somebody_is_shown_by_full_name_or_failing_that_username(
    full_name: str | None, expected: str
) -> None:
    user = User(username="sam.patel", email="sam@example.com")
    user.full_name = full_name

    assert messaging._user_display_name(user) == expected


def test_a_conversation_with_no_messages_has_no_preview(
    db_session: Session, nurse: User
) -> None:
    conv = _conversation(db_session, participants=[nurse])

    out = messaging._build_conversation_out(
        conv, 0, is_participant=True, can_write=True
    )

    assert out.last_message_preview is None
    assert out.last_message_time is None
    assert [p.user_id for p in out.participants] == [nurse.id]
    assert out.participants[0].display_name == "Sam Patel"


def test_the_preview_is_the_latest_message_cut_to_200_characters(
    db_session: Session, nurse: User
) -> None:
    conv = _conversation(db_session, participants=[nurse])
    _message(db_session, conv, nurse, minutes=5, body="b" * 201)
    _message(db_session, conv, nurse, minutes=1, body="An earlier one")

    out = messaging._build_conversation_out(
        conv, 0, is_participant=True, can_write=True
    )

    assert out.last_message_preview == "b" * 200
    assert out.last_message_time == _at(5).replace(tzinfo=None)


def test_a_summary_carries_the_count_and_flags_it_was_given(
    db_session: Session, nurse: User
) -> None:
    conv = _conversation(db_session, participants=[nurse], status="resolved")

    out = messaging._build_conversation_out(
        conv, 7, is_participant=False, can_write=False
    )

    assert out.unread_count == 7
    assert out.is_participant is False
    assert out.can_write is False
    assert out.status == "resolved"
    assert out.patient_id == PATIENT
    assert out.include_patient_as_participant is False


# ---------------------------------------------------------------------------
# Starting a conversation
# ---------------------------------------------------------------------------


def test_somebody_who_may_not_read_the_patient_cannot_start_one(
    db_session: Session, fhir: list[dict[str, Any]]
) -> None:
    """Refused before anything is written, to FHIR or to the database."""
    stranger = _user(db_session, "stranger")

    with pytest.raises(NotInPatientOrganisation):
        create_conversation(
            db=db_session,
            creator=stranger,
            patient_id=PATIENT,
            initial_message="Hello",
        )

    assert fhir == []
    assert db_session.scalars(select(Conversation.id)).all() == []


def test_naming_somebody_who_does_not_exist_writes_nothing(
    db_session: Session, nurse: User, fhir: list[dict[str, Any]]
) -> None:
    """Refused before the FHIR write, which no rollback would undo."""
    with pytest.raises(UserNotFound):
        create_conversation(
            db=db_session,
            creator=nurse,
            patient_id=PATIENT,
            initial_message="Hello",
            participant_ids=[9999],
        )

    assert fhir == []
    assert db_session.scalars(select(Conversation.id)).all() == []


def test_somebody_named_twice_joins_once(
    db_session: Session,
    nurse: User,
    colleague: User,
    fhir: list[dict[str, Any]],
) -> None:
    out = create_conversation(
        db=db_session,
        creator=nurse,
        patient_id=PATIENT,
        initial_message="Hello",
        participant_ids=[colleague.id, colleague.id],
    )

    joined = [p.user_id for p in out.participants]

    assert sorted(joined) == sorted([nurse.id, colleague.id])


def test_starting_one_writes_the_first_message_to_fhir(
    db_session: Session, nurse: User, fhir: list[dict[str, Any]]
) -> None:
    out = create_conversation(
        db=db_session,
        creator=nurse,
        patient_id=PATIENT,
        initial_message="Bloods are back",
    )

    assert fhir == [
        {
            "conversation_id": out.fhir_conversation_id,
            "patient_id": PATIENT,
            "sender_display": "Sam Patel",
            "sender_user_id": nurse.id,
            "body": "Bloods are back",
        }
    ]


def test_a_new_conversation_holds_its_creator_and_first_message(
    db_session: Session, nurse: User, fhir: list[dict[str, Any]]
) -> None:
    out = create_conversation(
        db=db_session,
        creator=nurse,
        patient_id=PATIENT,
        initial_message="Bloods are back",
    )

    assert out.status == "new"
    assert out.subject is None
    assert out.is_participant is True
    assert out.can_write is True
    assert out.include_patient_as_participant is False
    assert [(p.user_id, p.role) for p in out.participants] == [
        (nurse.id, "initiator")
    ]
    assert [(m.fhir_communication_id, m.body) for m in out.messages] == [
        ("comm-1", "Bloods are back")
    ]
    assert out.messages[0].sender_id == nurse.id
    assert out.messages[0].sender_display_name == "Sam Patel"
    assert out.messages[0].is_amendment is False


def test_a_new_conversation_keeps_the_subject_and_patient_flag_given(
    db_session: Session, nurse: User, fhir: list[dict[str, Any]]
) -> None:
    out = create_conversation(
        db=db_session,
        creator=nurse,
        patient_id=PATIENT,
        initial_message="Bloods are back",
        subject="Discharge plan",
        include_patient_as_participant=True,
    )
    _settle(db_session)

    stored = db_session.get(Conversation, out.id)

    assert stored is not None
    assert stored.subject == out.subject == "Discharge plan"
    assert stored.include_patient_as_participant is True
    assert out.include_patient_as_participant is True


def test_two_conversations_are_two_threads(
    db_session: Session, nurse: User, fhir: list[dict[str, Any]]
) -> None:
    first = create_conversation(
        db=db_session, creator=nurse, patient_id=PATIENT, initial_message="A"
    )
    second = create_conversation(
        db=db_session, creator=nurse, patient_id=PATIENT, initial_message="B"
    )

    assert first.id != second.id
    assert first.fhir_conversation_id != second.fhir_conversation_id


def test_a_new_conversation_belongs_to_the_organisations_both_are_in(
    db_session: Session,
    hospital: OrgUnit,
    nurse: User,
    fhir: list[dict[str, Any]],
) -> None:
    """Not the creator's other organisation, nor the patient's."""
    creators_other = _organisation(db_session, "Creator's clinic")
    patients_other = _organisation(db_session, "Patient's practice")
    shared = _organisation(db_session, "Shared practice")
    add_org_unit_member(db_session, creators_other.id, nurse.id, "staff")
    add_org_unit_member(db_session, shared.id, nurse.id, "staff")
    _admit(db_session, patients_other, PATIENT)
    _admit(db_session, shared, PATIENT)

    out = create_conversation(
        db=db_session,
        creator=nurse,
        patient_id=PATIENT,
        initial_message="Hello",
    )

    assert _places_of(db_session, out.id) == {hospital.id, shared.id}


def test_those_named_join_as_participants_and_bring_their_organisations(
    db_session: Session,
    hospital: OrgUnit,
    nurse: User,
    colleague: User,
    fhir: list[dict[str, Any]],
) -> None:
    clinic = _organisation(db_session, "Clinic")
    visitor = _user(db_session, "visitor")
    add_org_unit_member(db_session, clinic.id, visitor.id, "staff")

    out = create_conversation(
        db=db_session,
        creator=nurse,
        patient_id=PATIENT,
        initial_message="Hello",
        participant_ids=[colleague.id, visitor.id],
    )

    assert {p.user_id: p.role for p in out.participants} == {
        nurse.id: "initiator",
        colleague.id: "participant",
        visitor.id: "participant",
    }
    assert _places_of(db_session, out.id) == {hospital.id, clinic.id}


def test_the_creator_named_among_the_participants_is_added_once(
    db_session: Session,
    nurse: User,
    colleague: User,
    fhir: list[dict[str, Any]],
) -> None:
    out = create_conversation(
        db=db_session,
        creator=nurse,
        patient_id=PATIENT,
        initial_message="Hello",
        participant_ids=[nurse.id, colleague.id],
    )

    assert sorted((p.user_id, p.role) for p in out.participants) == sorted(
        [(nurse.id, "initiator"), (colleague.id, "participant")]
    )


@pytest.mark.parametrize("participant_ids", [None, []])
def test_with_nobody_named_the_creator_is_alone(
    db_session: Session,
    nurse: User,
    fhir: list[dict[str, Any]],
    participant_ids: list[int] | None,
) -> None:
    out = create_conversation(
        db=db_session,
        creator=nurse,
        patient_id=PATIENT,
        initial_message="Hello",
        participant_ids=participant_ids,
    )

    assert [p.user_id for p in out.participants] == [nurse.id]


def test_an_external_reader_with_a_grant_may_start_one_at_no_organisation(
    db_session: Session, hospital: OrgUnit, fhir: list[dict[str, Any]]
) -> None:
    """They share no organisation with the patient, so none is linked."""
    external = _user(db_session, "external", profession=EXTERNAL)
    _grant(db_session, external, PATIENT)

    out = create_conversation(
        db=db_session,
        creator=external,
        patient_id=PATIENT,
        initial_message="Hello",
    )

    assert _places_of(db_session, out.id) == set()
    assert out.messages[0].sender_display_name == "external"


# ---------------------------------------------------------------------------
# Listing conversations
# ---------------------------------------------------------------------------


def test_somebody_with_nothing_to_read_is_given_an_empty_list(
    db_session: Session, hospital: OrgUnit, colleague: User
) -> None:
    stranger = _user(db_session, "stranger")
    _conversation(db_session, places=[hospital], participants=[colleague])

    assert list_conversations(db=db_session, user=stranger) == []


def test_the_list_is_empty_when_there_are_no_conversations(
    db_session: Session, nurse: User
) -> None:
    assert list_conversations(db=db_session, user=nurse) == []


@pytest.mark.parametrize(
    ("read_at_minute", "expected"),
    [
        pytest.param(None, 2, id="never opened"),
        pytest.param(0, 2, id="opened before any of them"),
        pytest.param(2, 1, id="opened between them"),
        pytest.param(3, 0, id="opened as the last one arrived"),
    ],
)
def test_unread_is_what_others_sent_since_the_participant_last_looked(
    db_session: Session,
    nurse: User,
    colleague: User,
    read_at_minute: int | None,
    expected: int,
) -> None:
    """Their own messages never count, read or not."""
    conv = _conversation(db_session, participants=[nurse, colleague])
    _message(db_session, conv, colleague, minutes=1)
    _message(db_session, conv, nurse, minutes=2)
    _message(db_session, conv, colleague, minutes=3)
    _message(db_session, conv, nurse, minutes=4)

    if read_at_minute is not None:
        _read_at(db_session, conv, nurse, _at(read_at_minute))

    listed = list_conversations(db=db_session, user=nurse)

    assert [(c.id, c.unread_count) for c in listed] == [(conv.id, expected)]
    assert listed[0].is_participant is True
    assert listed[0].can_write is True


def test_a_reader_from_outside_sees_it_with_nothing_unread_and_no_pen(
    db_session: Session, hospital: OrgUnit, nurse: User, colleague: User
) -> None:
    conv = _conversation(
        db_session, places=[hospital], participants=[colleague]
    )
    _message(db_session, conv, colleague, minutes=1)

    listed = list_conversations(db=db_session, user=nurse)

    assert [c.id for c in listed] == [conv.id]
    assert listed[0].unread_count == 0
    assert listed[0].is_participant is False
    assert listed[0].can_write is False


def test_the_list_holds_only_what_the_reader_may_read(
    db_session: Session, hospital: OrgUnit, nurse: User, colleague: User
) -> None:
    clinic = _organisation(db_session, "Clinic")
    taking_part = _conversation(db_session, participants=[nurse])
    at_their_hospital = _conversation(db_session, places=[hospital])
    _conversation(db_session, places=[clinic], participants=[colleague])
    _conversation(db_session)

    listed = list_conversations(db=db_session, user=nurse)

    assert {c.id for c in listed} == {taking_part.id, at_their_hospital.id}


def test_the_list_is_in_order_of_latest_activity(
    db_session: Session, nurse: User
) -> None:
    oldest = _conversation(db_session, participants=[nurse], updated_at=_at(1))
    newest = _conversation(db_session, participants=[nurse], updated_at=_at(9))
    middle = _conversation(db_session, participants=[nurse], updated_at=_at(5))

    listed = list_conversations(db=db_session, user=nurse)

    assert [c.id for c in listed] == [newest.id, middle.id, oldest.id]


def test_the_list_narrows_by_status_and_by_patient(
    db_session: Session, nurse: User
) -> None:
    new = _conversation(db_session, participants=[nurse])
    active = _conversation(db_session, participants=[nurse], status="active")
    elsewhere = _conversation(
        db_session,
        participants=[nurse],
        patient_id=OTHER_PATIENT,
        status="active",
    )

    by_status = list_conversations(db=db_session, user=nurse, status="active")
    by_patient = list_conversations(
        db=db_session, user=nurse, patient_id=PATIENT
    )
    by_both = list_conversations(
        db=db_session, user=nurse, status="active", patient_id=PATIENT
    )
    by_neither = list_conversations(
        db=db_session, user=nurse, status="resolved"
    )

    assert {c.id for c in by_status} == {active.id, elsewhere.id}
    assert {c.id for c in by_patient} == {new.id, active.id}
    assert [c.id for c in by_both] == [active.id]
    assert by_neither == []


# ---------------------------------------------------------------------------
# Opening one conversation
# ---------------------------------------------------------------------------


def test_a_conversation_that_does_not_exist_opens_as_nothing(
    db_session: Session, nurse: User
) -> None:
    found = get_conversation_detail(
        db=db_session, conversation_id=9999, user=nurse
    )

    assert found is None


def test_one_the_reader_may_not_read_opens_as_nothing_too(
    db_session: Session, hospital: OrgUnit, colleague: User
) -> None:
    """The same answer as one that does not exist, so it tells them nothing."""
    stranger = _user(db_session, "stranger")
    conv = _conversation(
        db_session, places=[hospital], participants=[colleague]
    )

    found = get_conversation_detail(
        db=db_session, conversation_id=conv.id, user=stranger
    )

    assert found is None
    assert _last_read(db_session, conv, colleague) is None


def test_a_participant_opens_it_with_the_messages_oldest_first(
    db_session: Session, nurse: User, colleague: User
) -> None:
    conv = _conversation(db_session, participants=[nurse, colleague])
    correction = _message(db_session, conv, nurse, minutes=9, body="Third")
    first = _message(db_session, conv, colleague, minutes=1, body="First")
    second = _message(db_session, conv, nurse, minutes=4, body="Second")

    found = get_conversation_detail(
        db=db_session, conversation_id=conv.id, user=nurse
    )

    assert found is not None
    assert [m.id for m in found.messages] == [
        first.id,
        second.id,
        correction.id,
    ]
    assert [m.sender_display_name for m in found.messages] == [
        "colleague",
        "Sam Patel",
        "Sam Patel",
    ]
    assert found.is_participant is True
    assert found.can_write is True
    assert {p.user_id for p in found.participants} == {nurse.id, colleague.id}


def test_opening_one_marks_it_read_for_that_participant_alone(
    db_session: Session, nurse: User, colleague: User
) -> None:
    conv = _conversation(db_session, participants=[nurse, colleague])
    _message(db_session, conv, colleague, minutes=1)
    assert list_conversations(db=db_session, user=nurse)[0].unread_count == 1

    get_conversation_detail(db=db_session, conversation_id=conv.id, user=nurse)
    _settle(db_session)

    assert _last_read(db_session, conv, nurse) is not None
    assert _last_read(db_session, conv, colleague) is None
    assert list_conversations(db=db_session, user=nurse)[0].unread_count == 0


def test_a_reader_from_outside_opens_it_without_marking_anything_read(
    db_session: Session, hospital: OrgUnit, nurse: User, colleague: User
) -> None:
    conv = _conversation(
        db_session, places=[hospital], participants=[colleague]
    )
    _message(db_session, conv, colleague, minutes=1)

    found = get_conversation_detail(
        db=db_session, conversation_id=conv.id, user=nurse
    )
    _settle(db_session)

    assert found is not None
    assert found.is_participant is False
    assert found.can_write is False
    assert len(found.messages) == 1
    assert _taking_part(db_session, conv) == {colleague.id: "participant"}
    assert _last_read(db_session, conv, colleague) is None


# ---------------------------------------------------------------------------
# Sending a message
# ---------------------------------------------------------------------------


def test_a_message_cannot_be_sent_to_a_conversation_that_does_not_exist(
    db_session: Session, nurse: User, fhir: list[dict[str, Any]]
) -> None:
    with pytest.raises(ConversationNotFound):
        send_message(
            db=db_session, conversation_id=9999, sender=nurse, body="Hello"
        )

    assert fhir == []


def test_somebody_who_reads_from_outside_cannot_write(
    db_session: Session,
    hospital: OrgUnit,
    nurse: User,
    colleague: User,
    fhir: list[dict[str, Any]],
) -> None:
    conv = _conversation(
        db_session, places=[hospital], participants=[colleague]
    )

    with pytest.raises(NotAParticipant):
        send_message(
            db=db_session, conversation_id=conv.id, sender=nurse, body="Hello"
        )

    assert fhir == []
    assert db_session.scalars(select(Message.id)).all() == []


def test_the_first_message_of_an_empty_conversation_links_to_none(
    db_session: Session, nurse: User, fhir: list[dict[str, Any]]
) -> None:
    conv = _conversation(db_session, participants=[nurse])

    out = send_message(
        db=db_session, conversation_id=conv.id, sender=nurse, body="Hello"
    )

    assert fhir == [
        {
            "conversation_id": conv.fhir_conversation_id,
            "patient_id": PATIENT,
            "sender_display": "Sam Patel",
            "sender_user_id": nurse.id,
            "body": "Hello",
            "first_message_fhir_id": None,
            "amends_fhir_id": None,
        }
    ]
    assert out.fhir_communication_id == "comm-1"
    assert out.body == "Hello"
    assert out.sender_username == "nurse"
    assert out.amends_id is None
    assert out.is_amendment is False


def test_a_reply_is_linked_to_the_earliest_message_of_the_thread(
    db_session: Session,
    nurse: User,
    colleague: User,
    fhir: list[dict[str, Any]],
) -> None:
    """Earliest by time, whichever row was written first."""
    conv = _conversation(db_session, participants=[nurse, colleague])
    _message(db_session, conv, nurse, minutes=8)
    earliest = _message(db_session, conv, colleague, minutes=2)

    send_message(
        db=db_session, conversation_id=conv.id, sender=nurse, body="Reply"
    )

    assert fhir[0]["first_message_fhir_id"] == earliest.fhir_communication_id


@pytest.mark.parametrize(
    ("before", "after"),
    [("new", "active"), ("active", "active"), ("resolved", "resolved")],
)
def test_only_a_new_conversation_is_made_active_by_a_message(
    db_session: Session,
    nurse: User,
    fhir: list[dict[str, Any]],
    before: str,
    after: str,
) -> None:
    conv = _conversation(db_session, participants=[nurse], status=before)

    send_message(
        db=db_session, conversation_id=conv.id, sender=nurse, body="Hello"
    )
    _settle(db_session)

    assert conv.status == after


@pytest.mark.parametrize("status", ["new", "active", "resolved"])
def test_every_message_moves_the_conversation_to_the_top(
    db_session: Session,
    nurse: User,
    fhir: list[dict[str, Any]],
    status: str,
) -> None:
    """Whatever its status: the lists are ordered by updated_at."""
    quiet = _conversation(
        db_session, participants=[nurse], status=status, updated_at=_at(1)
    )
    recent = _conversation(
        db_session, participants=[nurse], status="active", updated_at=_at(9)
    )

    send_message(
        db=db_session, conversation_id=quiet.id, sender=nurse, body="Hello"
    )
    _settle(db_session)

    listed = list_conversations(db=db_session, user=nurse)

    assert [c.id for c in listed] == [quiet.id, recent.id]


def test_a_message_is_stored_as_fhir_named_it(
    db_session: Session, nurse: User, fhir: list[dict[str, Any]]
) -> None:
    conv = _conversation(db_session, participants=[nurse])

    out = send_message(
        db=db_session, conversation_id=conv.id, sender=nurse, body="Hello"
    )
    _settle(db_session)

    stored = db_session.get(Message, out.id)

    assert stored is not None
    assert stored.fhir_communication_id == "comm-1"
    assert stored.conversation_id == conv.id
    assert stored.sender_id == nurse.id
    assert stored.body == "Hello"


def test_an_amendment_names_the_message_it_corrects(
    db_session: Session, nurse: User, fhir: list[dict[str, Any]]
) -> None:
    conv = _conversation(db_session, participants=[nurse])
    original = _message(db_session, conv, nurse, minutes=1, body="5 mg")

    out = send_message(
        db=db_session,
        conversation_id=conv.id,
        sender=nurse,
        body="50 mg",
        amends_id=original.id,
    )

    assert out.amends_id == original.id
    assert out.is_amendment is True
    assert fhir[0]["amends_fhir_id"] == original.fhir_communication_id
    assert original.body == "5 mg"


def test_an_amendment_of_a_message_that_does_not_exist_is_refused(
    db_session: Session, nurse: User, fhir: list[dict[str, Any]]
) -> None:
    conv = _conversation(db_session, participants=[nurse])

    with pytest.raises(AmendedMessageNotFound):
        send_message(
            db=db_session,
            conversation_id=conv.id,
            sender=nurse,
            body="50 mg",
            amends_id=9999,
        )

    assert fhir == []


def test_an_amendment_of_a_message_in_another_conversation_is_refused(
    db_session: Session, nurse: User, fhir: list[dict[str, Any]]
) -> None:
    """Even their own message: a correction stays in its own thread."""
    conv = _conversation(db_session, participants=[nurse])
    other = _conversation(db_session, participants=[nurse])
    elsewhere = _message(db_session, other, nurse)

    with pytest.raises(AmendedMessageInAnotherConversation):
        send_message(
            db=db_session,
            conversation_id=conv.id,
            sender=nurse,
            body="50 mg",
            amends_id=elsewhere.id,
        )

    assert fhir == []


def test_nobody_amends_a_message_somebody_else_sent(
    db_session: Session,
    nurse: User,
    colleague: User,
    fhir: list[dict[str, Any]],
) -> None:
    conv = _conversation(db_session, participants=[nurse, colleague])
    theirs = _message(db_session, conv, colleague)

    with pytest.raises(CanOnlyAmendOwnMessages):
        send_message(
            db=db_session,
            conversation_id=conv.id,
            sender=nurse,
            body="50 mg",
            amends_id=theirs.id,
        )

    assert fhir == []
    assert len(db_session.scalars(select(Message.id)).all()) == 1


# ---------------------------------------------------------------------------
# Adding a participant
# ---------------------------------------------------------------------------


def test_nobody_is_added_to_a_conversation_that_does_not_exist(
    db_session: Session, nurse: User
) -> None:
    with pytest.raises(ConversationNotFound):
        add_participant(db=db_session, conversation_id=9999, user_id=nurse.id)

    assert db_session.scalars(select(ConversationParticipant.id)).all() == []


def test_a_user_who_does_not_exist_cannot_be_added(
    db_session: Session, nurse: User
) -> None:
    conv = _conversation(db_session, participants=[nurse])

    with pytest.raises(UserNotFound):
        add_participant(db=db_session, conversation_id=conv.id, user_id=9999)

    assert _taking_part(db_session, conv) == {nurse.id: "participant"}


@pytest.mark.parametrize(
    ("given", "expected"),
    [({}, "participant"), ({"role": "tagged"}, "tagged")],
)
def test_somebody_added_takes_the_role_given_or_participant(
    db_session: Session,
    nurse: User,
    colleague: User,
    given: dict[str, str],
    expected: str,
) -> None:
    conv = _conversation(db_session, participants=[nurse])

    out = add_participant(
        db=db_session, conversation_id=conv.id, user_id=colleague.id, **given
    )

    assert out.user_id == colleague.id
    assert out.username == "colleague"
    assert out.display_name == "colleague"
    assert out.role == expected
    assert _taking_part(db_session, conv) == {
        nurse.id: "participant",
        colleague.id: expected,
    }


def test_somebody_added_brings_their_organisations_with_them(
    db_session: Session, hospital: OrgUnit, nurse: User
) -> None:
    clinic = _organisation(db_session, "Clinic")
    visitor = _user(db_session, "visitor")
    add_org_unit_member(db_session, clinic.id, visitor.id, "staff")
    conv = _conversation(db_session, places=[hospital], participants=[nurse])

    add_participant(db=db_session, conversation_id=conv.id, user_id=visitor.id)

    assert _places_of(db_session, conv.id) == {hospital.id, clinic.id}


def test_adding_somebody_already_there_changes_nothing(
    db_session: Session, nurse: User, colleague: User
) -> None:
    """They keep the role they had, whatever role is asked for now."""
    conv = _conversation(db_session, participants=[nurse])
    add_participant(
        db=db_session,
        conversation_id=conv.id,
        user_id=colleague.id,
        role="tagged",
    )

    again = add_participant(
        db=db_session, conversation_id=conv.id, user_id=colleague.id
    )

    assert again.role == "tagged"
    assert _taking_part(db_session, conv) == {
        nurse.id: "participant",
        colleague.id: "tagged",
    }


# ---------------------------------------------------------------------------
# Marking a conversation read
# ---------------------------------------------------------------------------


def test_marking_read_is_refused_for_somebody_not_taking_part(
    db_session: Session, hospital: OrgUnit, nurse: User, colleague: User
) -> None:
    """Even one who may read it from outside."""
    conv = _conversation(
        db_session, places=[hospital], participants=[colleague]
    )

    marked = mark_conversation_read(
        db=db_session, conversation_id=conv.id, user_id=nurse.id
    )
    _settle(db_session)

    assert marked is False
    assert _last_read(db_session, conv, colleague) is None


def test_marking_read_of_a_conversation_that_does_not_exist_is_refused(
    db_session: Session, nurse: User
) -> None:
    marked = mark_conversation_read(
        db=db_session, conversation_id=9999, user_id=nurse.id
    )

    assert marked is False


def test_marking_read_clears_what_was_unread_for_that_participant_alone(
    db_session: Session, nurse: User, colleague: User
) -> None:
    conv = _conversation(db_session, participants=[nurse, colleague])
    other = _conversation(db_session, participants=[nurse])
    _message(db_session, conv, colleague, minutes=1)
    _message(db_session, other, colleague, minutes=1)

    marked = mark_conversation_read(
        db=db_session, conversation_id=conv.id, user_id=nurse.id
    )
    _settle(db_session)

    unread = {
        c.id: c.unread_count
        for c in list_conversations(db=db_session, user=nurse)
    }

    assert marked is True
    assert unread == {conv.id: 0, other.id: 1}
    assert _last_read(db_session, conv, nurse) is not None
    assert _last_read(db_session, conv, colleague) is None


# ---------------------------------------------------------------------------
# One patient's conversations
# ---------------------------------------------------------------------------


def test_somebody_who_may_not_read_the_patient_is_given_none_of_theirs(
    db_session: Session, hospital: OrgUnit
) -> None:
    """Not even one they take part in: the patient is asked about first."""
    invited = _user(db_session, "invited", profession=NO_RECORDS)
    _conversation(db_session, places=[hospital], participants=[invited])

    listed = list_patient_conversations(
        db=db_session, patient_id=PATIENT, user=invited
    )

    assert listed == []


def test_one_patients_list_holds_only_that_patients_conversations(
    db_session: Session, hospital: OrgUnit, nurse: User
) -> None:
    _admit(db_session, hospital, OTHER_PATIENT)
    older = _conversation(db_session, places=[hospital], updated_at=_at(1))
    newer = _conversation(
        db_session, participants=[nurse], status="active", updated_at=_at(5)
    )
    _conversation(db_session, places=[hospital], patient_id=OTHER_PATIENT)

    listed = list_patient_conversations(
        db=db_session, patient_id=PATIENT, user=nurse
    )
    active = list_patient_conversations(
        db=db_session, patient_id=PATIENT, user=nurse, status="active"
    )

    assert [c.id for c in listed] == [newer.id, older.id]
    assert [c.is_participant for c in listed] == [True, False]
    assert [c.can_write for c in listed] == [True, False]
    assert [c.id for c in active] == [newer.id]


def test_one_patients_list_leaves_out_what_the_reader_may_not_read(
    db_session: Session, hospital: OrgUnit, nurse: User, colleague: User
) -> None:
    """The patient is in reach, but that conversation is at a clinic."""
    clinic = _organisation(db_session, "Clinic")
    _admit(db_session, clinic, PATIENT)
    readable = _conversation(db_session, places=[hospital])
    _conversation(db_session, places=[clinic], participants=[colleague])

    listed = list_patient_conversations(
        db=db_session, patient_id=PATIENT, user=nurse
    )

    assert [c.id for c in listed] == [readable.id]


@pytest.mark.parametrize(
    ("read_at_minute", "expected"),
    [
        pytest.param(None, 2, id="never opened"),
        pytest.param(2, 1, id="opened between them"),
        pytest.param(3, 0, id="opened as the last one arrived"),
    ],
)
def test_one_patients_list_counts_unread_as_the_full_list_does(
    db_session: Session,
    nurse: User,
    colleague: User,
    read_at_minute: int | None,
    expected: int,
) -> None:
    conv = _conversation(db_session, participants=[nurse, colleague])
    _message(db_session, conv, colleague, minutes=1)
    _message(db_session, conv, nurse, minutes=2)
    _message(db_session, conv, colleague, minutes=3)

    if read_at_minute is not None:
        _read_at(db_session, conv, nurse, _at(read_at_minute))

    listed = list_patient_conversations(
        db=db_session, patient_id=PATIENT, user=nurse
    )

    assert [c.unread_count for c in listed] == [expected]


def test_a_reader_from_outside_has_nothing_unread_in_a_patients_list(
    db_session: Session, hospital: OrgUnit, nurse: User, colleague: User
) -> None:
    conv = _conversation(
        db_session, places=[hospital], participants=[colleague]
    )
    _message(db_session, conv, colleague, minutes=1)

    listed = list_patient_conversations(
        db=db_session, patient_id=PATIENT, user=nurse
    )

    assert [c.unread_count for c in listed] == [0]


def test_a_patient_sees_only_the_conversations_about_them_they_are_in(
    db_session: Session, hospital: OrgUnit, colleague: User
) -> None:
    """Their own record opens the list; it does not open staff threads."""
    patient = _user(
        db_session, "patient", profession="patient", fhir_patient_id=PATIENT
    )
    with_them = _conversation(
        db_session, places=[hospital], participants=[colleague, patient]
    )
    _conversation(db_session, places=[hospital], participants=[colleague])

    listed = list_patient_conversations(
        db=db_session, patient_id=PATIENT, user=patient
    )

    assert [c.id for c in listed] == [with_them.id]
    assert listed[0].can_write is True


# ---------------------------------------------------------------------------
# Joining a conversation
# ---------------------------------------------------------------------------


def test_nobody_joins_a_conversation_that_does_not_exist(
    db_session: Session, nurse: User
) -> None:
    with pytest.raises(ConversationNotFound):
        join_conversation(db=db_session, conversation_id=9999, user=nurse)


def test_staff_at_one_of_its_organisations_join_as_a_participant(
    db_session: Session, hospital: OrgUnit, nurse: User, colleague: User
) -> None:
    clinic = _organisation(db_session, "Clinic")
    conv = _conversation(
        db_session, places=[clinic, hospital], participants=[colleague]
    )

    out = join_conversation(db=db_session, conversation_id=conv.id, user=nurse)

    assert out.user_id == nurse.id
    assert out.role == "participant"
    assert out.display_name == "Sam Patel"
    assert _taking_part(db_session, conv) == {
        colleague.id: "participant",
        nurse.id: "participant",
    }


def test_somebody_joining_brings_their_other_organisations(
    db_session: Session, hospital: OrgUnit, nurse: User
) -> None:
    clinic = _organisation(db_session, "Clinic")
    add_org_unit_member(db_session, clinic.id, nurse.id, "staff")
    conv = _conversation(db_session, places=[hospital])

    join_conversation(db=db_session, conversation_id=conv.id, user=nurse)

    assert _places_of(db_session, conv.id) == {hospital.id, clinic.id}


def test_joining_twice_leaves_one_row_and_the_role_already_held(
    db_session: Session, hospital: OrgUnit, nurse: User
) -> None:
    conv = _conversation(db_session, places=[hospital])
    db_session.add(
        ConversationParticipant(
            conversation_id=conv.id, user_id=nurse.id, role="initiator"
        )
    )
    _settle(db_session)

    out = join_conversation(db=db_session, conversation_id=conv.id, user=nurse)

    assert out.role == "initiator"
    assert _taking_part(db_session, conv) == {nurse.id: "initiator"}


@pytest.mark.parametrize("capacity", ["trainee", "external", "patient"])
def test_a_member_who_is_not_staff_cannot_join(
    db_session: Session, hospital: OrgUnit, capacity: str
) -> None:
    """Membership in what capacity, not merely membership."""
    member = _user(db_session, "member")
    add_org_unit_member(db_session, hospital.id, member.id, capacity)
    conv = _conversation(db_session, places=[hospital])

    with pytest.raises(NotInMessageOrganisation):
        join_conversation(db=db_session, conversation_id=conv.id, user=member)

    assert _taking_part(db_session, conv) == {}


def test_staff_of_another_organisation_cannot_join(
    db_session: Session, hospital: OrgUnit
) -> None:
    clinic = _organisation(db_session, "Clinic")
    stranger = _user(db_session, "stranger")
    add_org_unit_member(db_session, clinic.id, stranger.id, "staff")
    conv = _conversation(db_session, places=[hospital])

    with pytest.raises(NotInMessageOrganisation):
        join_conversation(
            db=db_session, conversation_id=conv.id, user=stranger
        )


def test_nobody_joins_a_conversation_that_belongs_to_no_organisation(
    db_session: Session, nurse: User
) -> None:
    conv = _conversation(db_session)

    with pytest.raises(NotInMessageOrganisation):
        join_conversation(db=db_session, conversation_id=conv.id, user=nurse)


def test_a_grant_for_the_patient_does_not_let_an_external_reader_join(
    db_session: Session, hospital: OrgUnit
) -> None:
    """They may read it; joining is for the organisation's staff."""
    external = _user(db_session, "external", profession=EXTERNAL)
    _grant(db_session, external, PATIENT)
    conv = _conversation(db_session, places=[hospital])

    with pytest.raises(NotInMessageOrganisation):
        join_conversation(
            db=db_session, conversation_id=conv.id, user=external
        )


def test_staff_who_may_not_read_patient_records_cannot_join(
    db_session: Session, hospital: OrgUnit
) -> None:
    """Joining would make them a participant, who reads every message."""
    operator = _user(db_session, "operator", profession=NO_RECORDS)
    add_org_unit_member(db_session, hospital.id, operator.id, "staff")
    conv = _conversation(db_session, places=[hospital])

    with pytest.raises(LacksPatientRecordCompetency):
        join_conversation(
            db=db_session, conversation_id=conv.id, user=operator
        )

    assert _taking_part(db_session, conv) == {}
    assert _places_of(db_session, conv.id) == {hospital.id}


def test_somebody_neither_staff_here_nor_competent_is_told_about_the_place(
    db_session: Session, hospital: OrgUnit
) -> None:
    """Membership is asked first, whatever competencies they hold."""
    operator = _user(db_session, "operator", profession=NO_RECORDS)
    conv = _conversation(db_session, places=[hospital])

    with pytest.raises(NotInMessageOrganisation):
        join_conversation(
            db=db_session, conversation_id=conv.id, user=operator
        )
