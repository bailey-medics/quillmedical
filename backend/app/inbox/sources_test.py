"""What each source of the inbox says is waiting on somebody, and its lines."""

import logging
from collections.abc import Callable
from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from itertools import count
from types import SimpleNamespace

import pytest
from sqlalchemy.orm import Session

from app.cbac.competencies import get_competency_details
from app.features.passport.models import (
    Passport,
    PassportLogbookConfirmationRequest,
    PassportSignOffRequest,
)
from app.inbox import sources
from app.inbox.sources import InboxLine
from app.models import Feedback, User
from tests.competencies import withhold

START = datetime(2026, 1, 5, 9, 0, tzinfo=UTC)

#: Unmistakable, so finding either in a line means it leaked.
SECRET_MESSAGE = "The case for Mrs Example-Leak shows the wrong dose"
SECRET_REPLY = "Corrected for Mrs Example-Leak, thank you"

#: A competency the catalogue names, and one it has never defined.
KNOWN_COMPETENCY = "perform_venepuncture"
UNKNOWN_COMPETENCY = "chest_drain_insertion"

#: Holds ``assess_clinician_passport``, so may be asked to assess.
ASSESSES = "registered_nurse"

#: Does not hold it.
DOES_NOT_ASSESS = "teaching_delegate"

#: What stands in for the passport store: only ever handed on.
STORE = object()

_names = count(1)


def _at(minutes: int) -> datetime:
    return START + timedelta(minutes=minutes)


def _user(
    db: Session,
    username: str,
    *,
    profession: str = ASSESSES,
    full_name: str | None = None,
    platform_role: str = "standard",
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        full_name=full_name,
        password_hash="x",
        is_active=True,
        email_verified=True,
        base_profession=profession,
        platform_role=platform_role,
    )
    db.add(user)
    db.flush()

    return user


def _feedback(
    db: Session,
    user: User | None,
    *,
    status: str = "new",
    category: str | None = "broken",
    minutes: int = 0,
    comment: str | None = None,
    commented_at: datetime | None = None,
    seen_at: datetime | None = None,
) -> Feedback:
    row = Feedback(
        user_id=user.id if user else None,
        category=category,
        message=SECRET_MESSAGE,
        route="/teaching",
        release="abc1234",
        viewport="390x844",
        user_agent="Mozilla/5.0",
        breadcrumbs=[],
        status=status,
        operator_comment=comment,
        operator_comment_at=commented_at,
        comment_seen_at=seen_at,
        created_at=_at(minutes),
    )
    db.add(row)
    db.flush()
    db.refresh(row)

    return row


def _passport(db: Session, user: User) -> Passport:
    # A passport's id is thirty-two hex characters.
    passport = Passport(id=f"{user.id:032x}", user_id=user.id)
    db.add(passport)
    db.flush()

    return passport


def _request(
    db: Session,
    passport: Passport,
    assessor_email: str,
    *,
    status: str = "open",
    name: str | None = None,
    competency_id: str = UNKNOWN_COMPETENCY,
    minutes: int = 0,
    resolved_at: datetime | None = None,
) -> PassportSignOffRequest:
    row = PassportSignOffRequest(
        passport_id=passport.id,
        signoff_id=name or f"sign-off-{next(_names)}",
        competency_id=competency_id,
        assessor_email=assessor_email,
        status=status,
        created_at=_at(minutes),
        resolved_at=resolved_at,
    )
    db.add(row)
    db.flush()
    db.refresh(row)

    return row


def _confirmation(
    db: Session,
    passport: Passport,
    supervisor_email: str,
    *,
    status: str = "open",
    competency_id: str = UNKNOWN_COMPETENCY,
    minutes: int = 0,
    resolved_at: datetime | None = None,
) -> PassportLogbookConfirmationRequest:
    row = PassportLogbookConfirmationRequest(
        passport_id=passport.id,
        competency_id=competency_id,
        entry_stem=f"2026-01-05-{next(_names):06d}",
        supervisor_email=supervisor_email,
        status=status,
        created_at=_at(minutes),
        resolved_at=resolved_at,
    )
    db.add(row)
    db.flush()
    db.refresh(row)

    return row


def _everything_in(lines: list[InboxLine]) -> str:
    """Every value of every line, as one string to search."""
    return " ".join(
        str(value) for line in lines for value in asdict(line).values()
    )


@pytest.fixture
def operator(db_session: Session) -> User:
    return _user(
        db_session,
        "operator",
        profession="superadmin_profession",
        platform_role="superadmin",
    )


@pytest.fixture
def sender(db_session: Session) -> User:
    """Somebody who sends feedback, and is no operator."""
    return _user(db_session, "sam.patel")


@pytest.fixture
def assessor(db_session: Session) -> User:
    """Somebody who may assess, asked at ``assessor@example.test``."""
    return _user(db_session, "assessor")


@pytest.fixture
def holder(db_session: Session) -> Passport:
    """The passport of a clinician who asks for things."""
    user = _user(db_session, "holder", full_name="Dr Priya Shah")

    return _passport(db_session, user)


@pytest.fixture
def records(monkeypatch: pytest.MonkeyPatch) -> list[tuple[object, str, str]]:
    """Stand in for reading a sign-off record, keeping what was asked for.

    A record whose folder name starts ``unreadable`` cannot be read.
    """
    asked: list[tuple[object, str, str]] = []

    def read_sign_off(
        store: object, passport_id: str, name: str
    ) -> SimpleNamespace:
        asked.append((store, passport_id, name))
        if name.startswith("unreadable"):
            raise FileNotFoundError(name)

        return SimpleNamespace(id=f"record-of-{name}")

    monkeypatch.setattr(sources, "get_passport_store", lambda: STORE)
    monkeypatch.setattr(sources.service, "read_sign_off", read_sign_off)

    return asked


# ---------------------------------------------------------------------------
# The sources themselves
# ---------------------------------------------------------------------------


def test_the_sources_keep_their_names_and_their_order() -> None:
    """The key is part of the API, and the order is how they are counted."""
    assert list(sources.SOURCES) == [
        "feedback_new",
        "feedback_reply",
        "passport_sign_off",
        "passport_logbook_confirmation",
    ]


def test_each_source_counts_and_lists_the_same_feature() -> None:
    wired = {
        key: (source.count, source.lines)
        for key, source in sources.SOURCES.items()
    }

    assert wired == {
        "feedback_new": (
            sources._feedback_new_count,
            sources._feedback_lines,
        ),
        "feedback_reply": (
            sources._feedback_reply_count,
            sources._feedback_reply_lines,
        ),
        "passport_sign_off": (
            sources._sign_off_count,
            sources._sign_off_lines,
        ),
        "passport_logbook_confirmation": (
            sources._logbook_confirmation_count,
            sources._logbook_confirmation_lines,
        ),
    }


@pytest.mark.parametrize("key", list(sources.SOURCES))
def test_every_source_is_empty_for_somebody_with_nothing_waiting(
    db_session: Session, sender: User, key: str
) -> None:
    source = sources.SOURCES[key]

    assert source.count(db_session, sender) == 0
    assert source.lines(db_session, sender, False) == []
    assert source.lines(db_session, sender, True) == []


# ---------------------------------------------------------------------------
# New feedback, for an operator
# ---------------------------------------------------------------------------


def test_an_operator_is_told_how_much_feedback_nobody_has_picked_up(
    db_session: Session, operator: User, sender: User
) -> None:
    _feedback(db_session, sender)
    _feedback(db_session, None)
    _feedback(db_session, sender, status="acknowledged")
    _feedback(db_session, sender, status="resolved")
    _feedback(db_session, sender, status="wont_fix")

    assert sources._feedback_new_count(db_session, operator) == 2


def test_an_operator_with_only_feedback_dealt_with_has_none_waiting(
    db_session: Session, operator: User, sender: User
) -> None:
    _feedback(db_session, sender, status="resolved")

    assert sources._feedback_new_count(db_session, operator) == 0
    assert sources._feedback_lines(db_session, operator, False) == []


def test_new_feedback_waits_on_nobody_but_an_operator(
    db_session: Session, operator: User, sender: User
) -> None:
    """Not even on its sender: it comes from every organisation."""
    _feedback(db_session, sender)
    _feedback(db_session, sender, status="resolved")

    assert sources._feedback_new_count(db_session, sender) == 0
    assert sources._feedback_lines(db_session, sender, False) == []
    assert sources._feedback_lines(db_session, sender, True) == []
    assert sources._feedback_new_count(db_session, operator) == 1


def test_a_feedback_line_says_who_sent_it_and_what_kind(
    db_session: Session, operator: User, sender: User
) -> None:
    row = _feedback(db_session, sender, category="inaccurate")

    lines = sources._feedback_lines(db_session, operator, False)

    assert lines == [
        InboxLine(
            id=row.id,
            title="Feedback from sam.patel",
            detail="Something is wrong or inaccurate",
            status="New",
            created_at=row.created_at,
            done=False,
            ref=None,
        )
    ]


def test_feedback_whose_sender_is_gone_is_still_listed(
    db_session: Session, operator: User
) -> None:
    row = _feedback(db_session, None)

    lines = sources._feedback_lines(db_session, operator, False)

    assert [(line.id, line.title) for line in lines] == [
        (row.id, "Feedback from a deleted user")
    ]


@pytest.mark.parametrize(
    ("category", "detail"),
    [
        ("broken", "Something is broken"),
        ("suggestion", "Suggestion"),
        ("other", "Something else"),
        (None, None),
        ("", None),
        ("not_a_category", None),
    ],
)
def test_a_feedback_line_names_its_category_or_says_nothing(
    db_session: Session,
    operator: User,
    sender: User,
    category: str | None,
    detail: str | None,
) -> None:
    _feedback(db_session, sender, category=category)

    lines = sources._feedback_lines(db_session, operator, False)

    assert [line.detail for line in lines] == [detail]


def test_waiting_feedback_is_listed_newest_first(
    db_session: Session, operator: User, sender: User
) -> None:
    """By when it was sent, whichever row was written first."""
    newest = _feedback(db_session, sender, minutes=9)
    oldest = _feedback(db_session, sender, minutes=1)
    middle = _feedback(db_session, sender, minutes=5)

    lines = sources._feedback_lines(db_session, operator, False)

    assert [line.id for line in lines] == [newest.id, middle.id, oldest.id]


def test_feedback_sent_at_the_same_moment_lists_the_later_row_first(
    db_session: Session, operator: User, sender: User
) -> None:
    first = _feedback(db_session, sender, minutes=3)
    second = _feedback(db_session, sender, minutes=3)
    third = _feedback(db_session, sender, minutes=3)

    lines = sources._feedback_lines(db_session, operator, False)

    assert [line.id for line in lines] == [third.id, second.id, first.id]


def test_feedback_dealt_with_is_listed_only_when_asked_for(
    db_session: Session, operator: User, sender: User
) -> None:
    waiting = _feedback(db_session, sender, minutes=4)
    acknowledged = _feedback(
        db_session, sender, status="acknowledged", minutes=1
    )
    resolved = _feedback(db_session, sender, status="resolved", minutes=2)
    wont_fix = _feedback(db_session, sender, status="wont_fix", minutes=3)

    still_waiting = sources._feedback_lines(db_session, operator, False)
    dealt_with = sources._feedback_lines(db_session, operator, True)

    assert [(line.id, line.done) for line in still_waiting] == [
        (waiting.id, False)
    ]
    assert [(line.id, line.status, line.done) for line in dealt_with] == [
        (wont_fix.id, "Won't fix", True),
        (resolved.id, "Resolved", True),
        (acknowledged.id, "Acknowledged", True),
    ]


def test_feedback_lines_stop_at_the_most_recent_few(
    db_session: Session,
    operator: User,
    sender: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The lines are capped. The count is not: it is how many are waiting."""
    monkeypatch.setattr(sources, "MAX_ITEMS", 2)
    _feedback(db_session, sender, minutes=1)
    middle = _feedback(db_session, sender, minutes=2)
    newest = _feedback(db_session, sender, minutes=3)

    lines = sources._feedback_lines(db_session, operator, False)

    assert [line.id for line in lines] == [newest.id, middle.id]
    assert sources._feedback_new_count(db_session, operator) == 3


def test_at_most_fifty_lines_come_from_one_source() -> None:
    assert sources.MAX_ITEMS == 50


@pytest.mark.parametrize("done", [False, True])
def test_a_feedback_line_carries_nothing_anybody_wrote(
    db_session: Session, operator: User, sender: User, done: bool
) -> None:
    _feedback(db_session, sender, comment=SECRET_REPLY)
    _feedback(db_session, sender, status="resolved", comment=SECRET_REPLY)

    lines = sources._feedback_lines(db_session, operator, done)

    assert len(lines) == 1
    assert "Example-Leak" not in _everything_in(lines)


# ---------------------------------------------------------------------------
# Replies to the caller's own feedback
# ---------------------------------------------------------------------------


def test_a_reply_waits_on_its_sender_until_they_have_seen_it(
    db_session: Session, sender: User
) -> None:
    _feedback(db_session, sender, comment="Fixed", commented_at=_at(5))
    _feedback(
        db_session,
        sender,
        comment="Fixed",
        commented_at=_at(5),
        seen_at=_at(6),
    )
    _feedback(db_session, sender)

    assert sources._feedback_reply_count(db_session, sender) == 1


def test_a_reply_changed_since_it_was_seen_waits_again(
    db_session: Session, sender: User
) -> None:
    row = _feedback(
        db_session,
        sender,
        comment="Fixed, again",
        commented_at=_at(9),
        seen_at=_at(6),
    )

    waiting = sources._feedback_reply_lines(db_session, sender, False)
    read = sources._feedback_reply_lines(db_session, sender, True)

    assert sources._feedback_reply_count(db_session, sender) == 1
    assert [line.id for line in waiting] == [row.id]
    assert read == []


def test_a_reply_to_another_person_waits_on_nobody_but_them(
    db_session: Session, operator: User, sender: User
) -> None:
    """An operator wrote it, and it is still not theirs to be told of."""
    _feedback(db_session, sender, comment="Fixed", commented_at=_at(5))
    _feedback(db_session, None, comment="Fixed", commented_at=_at(5))

    assert sources._feedback_reply_count(db_session, operator) == 0
    assert sources._feedback_reply_lines(db_session, operator, False) == []
    assert sources._feedback_reply_lines(db_session, operator, True) == []


def test_a_reply_line_says_there_is_one_and_where_the_feedback_has_got_to(
    db_session: Session, sender: User
) -> None:
    row = _feedback(
        db_session,
        sender,
        status="resolved",
        category="suggestion",
        minutes=1,
        comment="Fixed",
        commented_at=_at(5),
    )

    lines = sources._feedback_reply_lines(db_session, sender, False)

    assert row.operator_comment_at is not None
    assert lines == [
        InboxLine(
            id=row.id,
            title="Reply to your feedback",
            detail="Suggestion",
            status="Resolved",
            created_at=row.operator_comment_at,
            done=False,
            ref=None,
        )
    ]
    assert row.operator_comment_at != row.created_at


def test_a_reply_with_no_time_on_it_is_dated_by_the_feedback(
    db_session: Session, sender: User
) -> None:
    row = _feedback(
        db_session, sender, minutes=7, comment="Fixed", commented_at=None
    )

    lines = sources._feedback_reply_lines(db_session, sender, False)

    assert [(line.id, line.created_at) for line in lines] == [
        (row.id, row.created_at)
    ]


def test_replies_are_listed_most_recently_written_first(
    db_session: Session, sender: User
) -> None:
    """By when the reply was written, not when the feedback was sent."""
    sent_last = _feedback(
        db_session, sender, minutes=30, comment="A", commented_at=_at(40)
    )
    sent_first = _feedback(
        db_session, sender, minutes=10, comment="B", commented_at=_at(60)
    )
    between = _feedback(
        db_session, sender, minutes=20, comment="C", commented_at=_at(50)
    )

    lines = sources._feedback_reply_lines(db_session, sender, False)

    assert [line.id for line in lines] == [
        sent_first.id,
        between.id,
        sent_last.id,
    ]


def test_replies_already_read_are_listed_only_when_asked_for(
    db_session: Session, sender: User
) -> None:
    """Feedback nobody has replied to is in neither list."""
    unseen = _feedback(db_session, sender, comment="New", commented_at=_at(5))
    read = _feedback(
        db_session,
        sender,
        status="acknowledged",
        comment="Read",
        commented_at=_at(5),
        seen_at=_at(6),
    )
    _feedback(db_session, sender, seen_at=_at(6))

    waiting = sources._feedback_reply_lines(db_session, sender, False)
    done = sources._feedback_reply_lines(db_session, sender, True)

    assert [(line.id, line.done) for line in waiting] == [(unseen.id, False)]
    assert [(line.id, line.status, line.done) for line in done] == [
        (read.id, "Acknowledged", True)
    ]


def test_reply_lines_stop_at_the_most_recent_few(
    db_session: Session, sender: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(sources, "MAX_ITEMS", 2)
    _feedback(db_session, sender, comment="A", commented_at=_at(1))
    middle = _feedback(db_session, sender, comment="B", commented_at=_at(2))
    newest = _feedback(db_session, sender, comment="C", commented_at=_at(3))

    lines = sources._feedback_reply_lines(db_session, sender, False)

    assert [line.id for line in lines] == [newest.id, middle.id]
    assert sources._feedback_reply_count(db_session, sender) == 3


@pytest.mark.parametrize("done", [False, True])
def test_a_reply_line_carries_neither_the_reply_nor_the_feedback(
    db_session: Session, sender: User, done: bool
) -> None:
    _feedback(db_session, sender, comment=SECRET_REPLY, commented_at=_at(5))
    _feedback(
        db_session,
        sender,
        comment=SECRET_REPLY,
        commented_at=_at(5),
        seen_at=_at(6),
    )

    lines = sources._feedback_reply_lines(db_session, sender, done)

    assert len(lines) == 1
    assert "Example-Leak" not in _everything_in(lines)


# ---------------------------------------------------------------------------
# What a passport line is built from
# ---------------------------------------------------------------------------


def test_a_competency_is_named_as_the_catalogue_names_it() -> None:
    entry = get_competency_details(KNOWN_COMPETENCY)

    assert entry is not None
    assert sources._competency_name(KNOWN_COMPETENCY) == entry.display_name


@pytest.mark.parametrize("competency_id", [UNKNOWN_COMPETENCY, ""])
def test_a_competency_the_catalogue_does_not_know_has_no_name(
    competency_id: str,
) -> None:
    assert sources._competency_name(competency_id) is None


def test_a_requests_record_is_read_from_its_holders_passport(
    records: list[tuple[object, str, str]],
) -> None:
    request = PassportSignOffRequest(
        id=7, passport_id="a" * 32, signoff_id="chest-drain"
    )

    found = sources._record_id(request)

    assert found == "record-of-chest-drain"
    assert records == [(STORE, "a" * 32, "chest-drain")]


@pytest.mark.parametrize(
    "failure", [FileNotFoundError("gone"), ValueError("bad"), RuntimeError()]
)
def test_a_record_that_cannot_be_read_has_no_id_and_is_warned_about(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    failure: Exception,
) -> None:
    """Whatever went wrong, and naming the request rather than anybody."""

    def read_sign_off(store: object, passport_id: str, name: str) -> None:
        raise failure

    monkeypatch.setattr(sources, "get_passport_store", lambda: STORE)
    monkeypatch.setattr(sources.service, "read_sign_off", read_sign_off)
    request = PassportSignOffRequest(
        id=7,
        passport_id="a" * 32,
        signoff_id="chest-drain",
        assessor_email="assessor@example.test",
    )

    with caplog.at_level(logging.WARNING, logger=sources.logger.name):
        found = sources._record_id(request)

    warnings = [record.getMessage() for record in caplog.records]

    assert found is None
    assert warnings == [
        "Sign-off request 7 names a record that could not be read"
    ]


def test_a_store_that_cannot_be_reached_ends_the_same_way(
    monkeypatch: pytest.MonkeyPatch,
    records: list[tuple[object, str, str]],
) -> None:
    def no_store() -> object:
        raise ConnectionError("the bucket is down")

    monkeypatch.setattr(sources, "get_passport_store", no_store)
    request = PassportSignOffRequest(
        id=7, passport_id="a" * 32, signoff_id="chest-drain"
    )

    assert sources._record_id(request) is None
    assert records == []


def _unsaved(profession: str, email: str) -> User:
    return User(username="somebody", email=email, base_profession=profession)


#: Both passport sources name somebody by address, and only an assessor.
either_passport_source = pytest.mark.parametrize(
    "asked", [sources._asked_of, sources._asked_to_confirm]
)


@either_passport_source
def test_somebody_with_no_address_is_asked_nothing(
    asked: Callable[[User], object],
) -> None:
    assert asked(_unsaved(ASSESSES, "")) is None


@either_passport_source
def test_somebody_who_may_not_assess_is_asked_nothing(
    asked: Callable[[User], object],
) -> None:
    user = _unsaved(DOES_NOT_ASSESS, "delegate@example.test")

    assert asked(user) is None


@either_passport_source
def test_an_assessor_with_an_address_may_be_asked(
    asked: Callable[[User], object],
) -> None:
    user = _unsaved(ASSESSES, "assessor@example.test")

    assert asked(user) is not None


# ---------------------------------------------------------------------------
# Sign-off requests, for the assessor they name
# ---------------------------------------------------------------------------


def test_open_requests_naming_the_assessor_are_counted_whoever_asked(
    db_session: Session, assessor: User, holder: Passport
) -> None:
    another = _passport(db_session, _user(db_session, "another"))
    _request(db_session, holder, assessor.email)
    _request(db_session, holder, assessor.email)
    _request(db_session, another, assessor.email)
    _request(db_session, holder, "somebody.else@example.test")

    assert sources._sign_off_count(db_session, assessor) == 3


@pytest.mark.parametrize(
    "typed",
    [
        "assessor@example.test",
        "ASSESSOR@EXAMPLE.TEST",
        "Assessor@Example.Test",
    ],
)
def test_a_request_names_its_assessor_whatever_case_was_typed(
    db_session: Session, assessor: User, holder: Passport, typed: str
) -> None:
    row = _request(db_session, holder, typed)

    lines = sources._sign_off_lines(db_session, assessor, False)

    assert sources._sign_off_count(db_session, assessor) == 1
    assert [line.id for line in lines] == [row.id]


@pytest.mark.parametrize("status", ["signed_off", "declined", "withdrawn"])
def test_a_request_stops_waiting_however_it_was_answered(
    db_session: Session, assessor: User, holder: Passport, status: str
) -> None:
    _request(
        db_session, holder, assessor.email, status=status, resolved_at=_at(5)
    )

    assert sources._sign_off_count(db_session, assessor) == 0
    assert sources._sign_off_lines(db_session, assessor, False) == []


def test_an_assessor_who_loses_the_competency_is_told_of_no_requests(
    db_session: Session, assessor: User, holder: Passport
) -> None:
    """The rows are still there; the passport would now refuse them."""
    _request(db_session, holder, assessor.email)
    _request(
        db_session,
        holder,
        assessor.email,
        status="declined",
        resolved_at=_at(5),
    )
    assert sources._sign_off_count(db_session, assessor) == 1

    withhold(assessor, "assess_clinician_passport")
    db_session.flush()

    assert sources._sign_off_count(db_session, assessor) == 0
    assert sources._sign_off_lines(db_session, assessor, False) == []
    assert sources._sign_off_lines(db_session, assessor, True) == []


def test_an_open_request_line_names_who_asked_and_about_what(
    db_session: Session,
    assessor: User,
    holder: Passport,
    records: list[tuple[object, str, str]],
) -> None:
    row = _request(
        db_session,
        holder,
        assessor.email,
        name="venepuncture",
        competency_id=KNOWN_COMPETENCY,
    )

    lines = sources._sign_off_lines(db_session, assessor, False)

    assert lines == [
        InboxLine(
            id=row.id,
            title="Sign-off request from Dr Priya Shah",
            detail=sources._competency_name(KNOWN_COMPETENCY),
            status="Waiting",
            created_at=row.created_at,
            done=False,
            ref="record-of-venepuncture",
        )
    ]
    assert lines[0].detail is not None
    assert records == [(STORE, holder.id, "venepuncture")]


def test_a_request_from_somebody_with_no_full_name_uses_their_username(
    db_session: Session,
    assessor: User,
    records: list[tuple[object, str, str]],
) -> None:
    nameless = _passport(db_session, _user(db_session, "j.okafor"))
    blank = _passport(db_session, _user(db_session, "b.lank", full_name=""))
    _request(db_session, nameless, assessor.email, minutes=2)
    _request(db_session, blank, assessor.email, minutes=1)

    lines = sources._sign_off_lines(db_session, assessor, False)

    assert [line.title for line in lines] == [
        "Sign-off request from j.okafor",
        "Sign-off request from b.lank",
    ]


def test_a_request_about_a_competency_since_retired_is_listed_unnamed(
    db_session: Session,
    assessor: User,
    holder: Passport,
    records: list[tuple[object, str, str]],
) -> None:
    row = _request(
        db_session, holder, assessor.email, competency_id=UNKNOWN_COMPETENCY
    )

    lines = sources._sign_off_lines(db_session, assessor, False)

    assert [(line.id, line.detail) for line in lines] == [(row.id, None)]


def test_open_requests_are_listed_newest_first(
    db_session: Session,
    assessor: User,
    holder: Passport,
    records: list[tuple[object, str, str]],
) -> None:
    newest = _request(db_session, holder, assessor.email, minutes=9)
    oldest = _request(db_session, holder, assessor.email, minutes=1)
    middle = _request(db_session, holder, assessor.email, minutes=5)
    twin = _request(db_session, holder, assessor.email, minutes=5)

    lines = sources._sign_off_lines(db_session, assessor, False)

    assert [line.id for line in lines] == [
        newest.id,
        twin.id,
        middle.id,
        oldest.id,
    ]


def test_one_record_that_cannot_be_read_does_not_hide_the_rest(
    db_session: Session,
    assessor: User,
    holder: Passport,
    records: list[tuple[object, str, str]],
) -> None:
    """It is still listed, with nowhere to go."""
    broken = _request(
        db_session, holder, assessor.email, name="unreadable", minutes=2
    )
    sound = _request(
        db_session, holder, assessor.email, name="sound", minutes=1
    )

    lines = sources._sign_off_lines(db_session, assessor, False)

    assert [(line.id, line.ref) for line in lines] == [
        (broken.id, None),
        (sound.id, "record-of-sound"),
    ]


def test_answered_requests_are_listed_by_when_they_were_answered(
    db_session: Session,
    assessor: User,
    holder: Passport,
    records: list[tuple[object, str, str]],
) -> None:
    """Most recently answered first, and dated by the answer.

    There is no page for an answered request, so no record is read.
    """
    asked_last = _request(
        db_session,
        holder,
        assessor.email,
        status="signed_off",
        minutes=30,
        resolved_at=_at(40),
    )
    asked_first = _request(
        db_session,
        holder,
        assessor.email,
        status="declined",
        minutes=10,
        resolved_at=_at(60),
    )
    between = _request(
        db_session,
        holder,
        assessor.email,
        status="withdrawn",
        minutes=20,
        resolved_at=_at(50),
    )
    _request(db_session, holder, assessor.email, minutes=70)

    lines = sources._sign_off_lines(db_session, assessor, True)

    assert [
        (line.id, line.status, line.created_at, line.done, line.ref)
        for line in lines
    ] == [
        (asked_first.id, "Declined", asked_first.resolved_at, True, None),
        (between.id, "Withdrawn", between.resolved_at, True, None),
        (asked_last.id, "Signed off", asked_last.resolved_at, True, None),
    ]
    assert records == []


def test_an_answered_request_with_no_time_on_it_is_placed_by_when_asked(
    db_session: Session,
    assessor: User,
    holder: Passport,
    records: list[tuple[object, str, str]],
) -> None:
    undated = _request(
        db_session, holder, assessor.email, status="withdrawn", minutes=50
    )
    later = _request(
        db_session,
        holder,
        assessor.email,
        status="declined",
        minutes=10,
        resolved_at=_at(60),
    )
    earlier = _request(
        db_session,
        holder,
        assessor.email,
        status="declined",
        minutes=10,
        resolved_at=_at(40),
    )

    lines = sources._sign_off_lines(db_session, assessor, True)

    assert [(line.id, line.created_at) for line in lines] == [
        (later.id, later.resolved_at),
        (undated.id, undated.created_at),
        (earlier.id, earlier.resolved_at),
    ]


def test_request_lines_stop_at_the_most_recent_few(
    db_session: Session,
    assessor: User,
    holder: Passport,
    records: list[tuple[object, str, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """And only the records of the lines given are read."""
    monkeypatch.setattr(sources, "MAX_ITEMS", 2)
    _request(db_session, holder, assessor.email, name="oldest", minutes=1)
    _request(db_session, holder, assessor.email, name="middle", minutes=2)
    _request(db_session, holder, assessor.email, name="newest", minutes=3)

    lines = sources._sign_off_lines(db_session, assessor, False)

    assert [line.ref for line in lines] == [
        "record-of-newest",
        "record-of-middle",
    ]
    assert [name for _store, _passport_id, name in records] == [
        "newest",
        "middle",
    ]
    assert sources._sign_off_count(db_session, assessor) == 3


# ---------------------------------------------------------------------------
# Logbook entries to confirm, for the supervisor they name
# ---------------------------------------------------------------------------


def test_open_asks_naming_the_supervisor_are_counted(
    db_session: Session, assessor: User, holder: Passport
) -> None:
    another = _passport(db_session, _user(db_session, "another"))
    _confirmation(db_session, holder, assessor.email)
    _confirmation(db_session, another, "ASSESSOR@example.test")
    _confirmation(db_session, holder, "somebody.else@example.test")
    _confirmation(
        db_session,
        holder,
        assessor.email,
        status="confirmed",
        resolved_at=_at(5),
    )
    _confirmation(
        db_session,
        holder,
        assessor.email,
        status="declined",
        resolved_at=_at(5),
    )

    assert sources._logbook_confirmation_count(db_session, assessor) == 2


def test_a_supervisor_who_loses_the_competency_is_told_of_no_asks(
    db_session: Session, assessor: User, holder: Passport
) -> None:
    _confirmation(db_session, holder, assessor.email)
    _confirmation(
        db_session,
        holder,
        assessor.email,
        status="confirmed",
        resolved_at=_at(5),
    )
    assert sources._logbook_confirmation_count(db_session, assessor) == 1

    withhold(assessor, "assess_clinician_passport")
    db_session.flush()

    assert sources._logbook_confirmation_count(db_session, assessor) == 0
    assert (
        sources._logbook_confirmation_lines(db_session, assessor, False) == []
    )
    assert (
        sources._logbook_confirmation_lines(db_session, assessor, True) == []
    )


def test_an_open_ask_line_names_who_asked_and_the_competency_logged(
    db_session: Session,
    assessor: User,
    holder: Passport,
    records: list[tuple[object, str, str]],
) -> None:
    """Its page is addressed by the row's own id, so there is no ref."""
    row = _confirmation(
        db_session, holder, assessor.email, competency_id=KNOWN_COMPETENCY
    )

    lines = sources._logbook_confirmation_lines(db_session, assessor, False)

    assert lines == [
        InboxLine(
            id=row.id,
            title="Logbook entry to confirm from Dr Priya Shah",
            detail=sources._competency_name(KNOWN_COMPETENCY),
            status="Waiting",
            created_at=row.created_at,
            done=False,
            ref=None,
        )
    ]
    assert lines[0].detail is not None
    assert records == []


def test_an_ask_from_somebody_with_no_full_name_uses_their_username(
    db_session: Session, assessor: User
) -> None:
    nameless = _passport(db_session, _user(db_session, "j.okafor"))
    row = _confirmation(db_session, nameless, assessor.email)

    lines = sources._logbook_confirmation_lines(db_session, assessor, False)

    assert [(line.id, line.title, line.detail) for line in lines] == [
        (row.id, "Logbook entry to confirm from j.okafor", None)
    ]


def test_open_asks_are_listed_newest_first(
    db_session: Session, assessor: User, holder: Passport
) -> None:
    newest = _confirmation(db_session, holder, assessor.email, minutes=9)
    oldest = _confirmation(db_session, holder, assessor.email, minutes=1)
    middle = _confirmation(db_session, holder, assessor.email, minutes=5)
    twin = _confirmation(db_session, holder, assessor.email, minutes=5)

    lines = sources._logbook_confirmation_lines(db_session, assessor, False)

    assert [line.id for line in lines] == [
        newest.id,
        twin.id,
        middle.id,
        oldest.id,
    ]


def test_answered_asks_are_listed_by_when_they_were_answered(
    db_session: Session, assessor: User, holder: Passport
) -> None:
    asked_last = _confirmation(
        db_session,
        holder,
        assessor.email,
        status="confirmed",
        minutes=30,
        resolved_at=_at(40),
    )
    asked_first = _confirmation(
        db_session,
        holder,
        assessor.email,
        status="declined",
        minutes=10,
        resolved_at=_at(60),
    )
    undated = _confirmation(
        db_session, holder, assessor.email, status="confirmed", minutes=50
    )
    _confirmation(db_session, holder, assessor.email, minutes=70)

    lines = sources._logbook_confirmation_lines(db_session, assessor, True)

    assert [
        (line.id, line.status, line.created_at, line.done) for line in lines
    ] == [
        (asked_first.id, "Not confirmed", asked_first.resolved_at, True),
        (undated.id, "Confirmed", undated.created_at, True),
        (asked_last.id, "Confirmed", asked_last.resolved_at, True),
    ]


def test_ask_lines_stop_at_the_most_recent_few(
    db_session: Session,
    assessor: User,
    holder: Passport,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(sources, "MAX_ITEMS", 2)
    _confirmation(db_session, holder, assessor.email, minutes=1)
    middle = _confirmation(db_session, holder, assessor.email, minutes=2)
    newest = _confirmation(db_session, holder, assessor.email, minutes=3)

    lines = sources._logbook_confirmation_lines(db_session, assessor, False)

    assert [line.id for line in lines] == [newest.id, middle.id]
    assert sources._logbook_confirmation_count(db_session, assessor) == 3
