"""Bringing somebody's competency rows into line with a pair of lists."""

from collections.abc import Iterable
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.base_professions import (
    competencies_kept_across_profession_change,
    get_profession_base_competencies,
)
from app.cbac.grants import (
    PROFESSION_SOURCE,
    PROTECTED_SOURCES,
    TERMS,
    sync_competency_rows,
)
from app.cbac.practising import authorise_practice
from app.models import (
    COMPETENCY_GRANT_SOURCES,
    OrgUnit,
    PractisingCompetency,
    User,
    UserCompetency,
)

NOW = datetime.now(UTC)
LONG_AGO = NOW - timedelta(days=400)
YESTERDAY = NOW - timedelta(days=1)
NEXT_MONTH = NOW + timedelta(days=30)

#: What the patient profession seeds, and so what a new patient holds.
OWN_RECORD = "access_own_patient_records"
DEATH = "certify_death"
CREMATION = "certify_cremation"
PASSPORT_WRITE = "passport_write"


def _person(
    db: Session,
    username: str,
    *,
    profession: str = "patient",
    seeded: bool = True,
) -> User:
    """A saved user. ``seeded=False`` drops the rows their profession gave."""
    user = _unsaved(username, profession=profession, seeded=seeded)
    db.add(user)
    db.flush()

    return user


def _unsaved(
    username: str, *, profession: str = "patient", seeded: bool = True
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash="x",
        is_active=True,
        email_verified=True,
        base_profession=profession,
    )

    if not seeded:
        user.competency_grants = []

    return user


def _place(db: Session, name: str) -> OrgUnit:
    place = OrgUnit(name=name, type="organisation")
    db.add(place)
    db.flush()

    return place


def _row(
    user: User,
    competency_id: str,
    *,
    source: str,
    starts_on: datetime = LONG_AGO,
    ends_on: datetime | None = None,
) -> UserCompetency:
    """A row already there before the save under test."""
    row = UserCompetency(
        competency_id=competency_id,
        starts_on=starts_on,
        ends_on=ends_on,
        source=source,
    )
    user.competency_grants.append(row)

    return row


def _rows(user: User, competency_id: str) -> list[UserCompetency]:
    return [
        row
        for row in user.competency_grants
        if row.competency_id == competency_id
    ]


def _only_row(user: User, competency_id: str) -> UserCompetency:
    (row,) = _rows(user, competency_id)

    return row


def _held(user: User) -> set[str]:
    return set(user.get_final_competencies())


def _closed(user: User) -> list[UserCompetency]:
    return [row for row in user.competency_grants if row.ends_on is not None]


def _practice(db: Session, user: User) -> set[tuple[int | None, str]]:
    """Where somebody may practise what, as place and competency pairs."""
    rows = db.execute(
        select(
            PractisingCompetency.org_unit_id, PractisingCompetency.competency
        ).where(PractisingCompetency.user_id == user.id)
    ).all()

    return {(org_unit_id, competency) for org_unit_id, competency in rows}


def _authorise(
    db: Session, user: User, place: OrgUnit, competency: str
) -> None:
    authorise_practice(
        db,
        user_id=user.id,
        org_unit_id=place.id,
        competency=competency,
        authorised_by=None,
    )


def test_every_source_this_module_names_is_one_a_row_accepts() -> None:
    """A row refuses an unknown source, so a slip here fails on first use."""
    named = {PROFESSION_SOURCE, *PROTECTED_SOURCES, *TERMS}

    assert named <= set(COMPETENCY_GRANT_SOURCES)


def test_none_for_both_lists_is_read_as_empty(db_session: Session) -> None:
    """Which leaves the template: somebody with no rows is seeded with it."""
    person = _person(db_session, "person", seeded=False)

    sync_competency_rows(person, additional=None, removed=None, source="admin")

    assert _held(person) == {OWN_RECORD}
    assert _only_row(person, OWN_RECORD).source == PROFESSION_SOURCE


def test_the_lists_may_be_any_iterable(db_session: Session) -> None:
    person = _person(db_session, "person")
    additional: Iterable[str] = (competency for competency in [DEATH])

    sync_competency_rows(
        person,
        additional=additional,
        removed=frozenset({OWN_RECORD}),
        source="admin",
    )

    assert _held(person) == {DEATH}


def test_an_id_named_twice_gets_one_row(db_session: Session) -> None:
    person = _person(db_session, "person")

    sync_competency_rows(
        person, additional=[DEATH, DEATH], removed=[], source="admin"
    )

    assert len(_rows(person, DEATH)) == 1


def test_an_id_on_both_lists_is_not_held(db_session: Session) -> None:
    """Removals are taken out last, so no row is opened to be closed."""
    person = _person(db_session, "person")

    sync_competency_rows(
        person, additional=[DEATH], removed=[DEATH], source="admin"
    )

    assert _rows(person, DEATH) == []
    assert _held(person) == {OWN_RECORD}


def test_an_id_on_both_lists_closes_the_row_they_had(
    db_session: Session,
) -> None:
    person = _person(db_session, "person")
    _row(person, DEATH, source="admin")

    sync_competency_rows(
        person, additional=[DEATH], removed=[DEATH], source="admin"
    )

    assert _only_row(person, DEATH).ends_on is not None
    assert DEATH not in _held(person)


def test_removing_what_they_never_held_changes_nothing(
    db_session: Session,
) -> None:
    person = _person(db_session, "person")
    before = list(person.competency_grants)

    sync_competency_rows(
        person, additional=[], removed=[DEATH], source="admin"
    )

    assert person.competency_grants == before
    assert _closed(person) == []


def test_a_new_row_records_how_who_through_where_and_from_when(
    db_session: Session,
) -> None:
    place = _place(db_session, "Trust")
    admin = _person(db_session, "admin")
    person = _person(db_session, "person")
    before = datetime.now(UTC)

    sync_competency_rows(
        person,
        additional=[DEATH],
        removed=[],
        source="operator",
        granted_by=admin.id,
        org_unit_id=place.id,
    )

    row = _only_row(person, DEATH)

    assert row.source == "operator"
    assert row.granted_by == admin.id
    assert row.org_unit_id == place.id
    assert row.starts_on is not None
    assert before <= row.starts_on <= datetime.now(UTC)
    assert row.ends_on is None


def test_a_row_names_nobody_and_no_place_unless_told(
    db_session: Session,
) -> None:
    person = _person(db_session, "person")

    sync_competency_rows(
        person, additional=[DEATH], removed=[], source="bootstrap"
    )

    row = _only_row(person, DEATH)

    assert row.granted_by is None
    assert row.org_unit_id is None


def test_an_individual_grant_ends_exactly_one_term_after_it_starts(
    db_session: Session,
) -> None:
    person = _person(db_session, "person")

    sync_competency_rows(
        person, additional=[PASSPORT_WRITE], removed=[], source="individual"
    )

    row = _only_row(person, PASSPORT_WRITE)

    assert row.starts_on is not None
    assert row.ends_on == row.starts_on + TERMS["individual"]


def test_a_template_row_seeded_by_an_individual_save_has_no_term(
    db_session: Session,
) -> None:
    """The term goes by the row's own source: here, the profession's."""
    person = _person(db_session, "person", seeded=False)

    sync_competency_rows(
        person, additional=[PASSPORT_WRITE], removed=[], source="individual"
    )

    seeded = _only_row(person, OWN_RECORD)

    assert seeded.source == PROFESSION_SOURCE
    assert seeded.ends_on is None
    assert _only_row(person, PASSPORT_WRITE).ends_on is not None


def test_a_template_competency_asked_for_takes_the_saves_source_and_term(
    db_session: Session,
) -> None:
    """Asked for by name, it is a grant like any other, not a seeded row."""
    person = _person(db_session, "person", seeded=False)

    sync_competency_rows(
        person, additional=[OWN_RECORD], removed=[], source="individual"
    )

    row = _only_row(person, OWN_RECORD)

    assert row.source == "individual"
    assert row.starts_on is not None
    assert row.ends_on == row.starts_on + TERMS["individual"]


def test_a_term_that_is_running_is_not_extended_by_saving_again(
    db_session: Session,
) -> None:
    person = _person(db_session, "person")
    running = _row(
        person, PASSPORT_WRITE, source="individual", ends_on=NEXT_MONTH
    )

    sync_competency_rows(
        person, additional=[PASSPORT_WRITE], removed=[], source="individual"
    )

    assert _rows(person, PASSPORT_WRITE) == [running]
    assert running.ends_on == NEXT_MONTH


def test_a_term_that_has_ended_is_granted_afresh(db_session: Session) -> None:
    """A new row for the new term: the old one keeps the dates it had."""
    person = _person(db_session, "person")
    lapsed = _row(
        person, PASSPORT_WRITE, source="individual", ends_on=YESTERDAY
    )

    sync_competency_rows(
        person, additional=[PASSPORT_WRITE], removed=[], source="individual"
    )

    old, new = _rows(person, PASSPORT_WRITE)

    assert old is lapsed
    assert old.starts_on == LONG_AGO
    assert old.ends_on == YESTERDAY
    assert new.starts_on is not None
    assert new.ends_on == new.starts_on + TERMS["individual"]
    assert PASSPORT_WRITE in _held(person)


def test_a_row_already_closed_is_left_as_it_was(db_session: Session) -> None:
    """Its end says until when it was held, so no later save moves it."""
    person = _person(db_session, "person")
    closed = _row(person, DEATH, source="admin", ends_on=YESTERDAY)

    sync_competency_rows(person, additional=[], removed=[], source="admin")

    assert closed.ends_on == YESTERDAY
    assert _rows(person, DEATH) == [closed]


def test_a_current_row_from_another_source_suppresses_a_new_one(
    db_session: Session,
) -> None:
    """They hold it already, however they came by it."""
    person = _person(db_session, "person")
    existing = _row(person, PASSPORT_WRITE, source="organisation")

    sync_competency_rows(
        person, additional=[PASSPORT_WRITE], removed=[], source="admin"
    )

    assert _rows(person, PASSPORT_WRITE) == [existing]
    assert existing.source == "organisation"


def test_every_current_row_for_a_lost_competency_is_closed(
    db_session: Session,
) -> None:
    person = _person(db_session, "person")
    first = _row(person, DEATH, source="admin")
    second = _row(person, DEATH, source="operator", ends_on=NEXT_MONTH)
    before = datetime.now(UTC)

    sync_competency_rows(person, additional=[], removed=[], source="admin")

    assert first.ends_on is not None
    assert first.ends_on == second.ends_on
    assert before <= first.ends_on <= datetime.now(UTC)
    assert DEATH not in _held(person)


def test_closing_a_row_keeps_everything_else_it_says(
    db_session: Session,
) -> None:
    """Closed, never deleted: who held what, and from when, stays readable."""
    person = _person(db_session, "person")
    row = _row(person, DEATH, source="operator")

    sync_competency_rows(person, additional=[], removed=[], source="admin")

    assert _rows(person, DEATH) == [row]
    assert row.source == "operator"
    assert row.starts_on == LONG_AGO


@pytest.mark.parametrize("source", sorted(PROTECTED_SOURCES))
def test_a_protected_row_is_never_closed_whatever_the_lists_say(
    db_session: Session, source: str
) -> None:
    """Left off ``additional`` and named in ``removed``, and still held."""
    person = _person(db_session, "person")
    protected = _row(person, PASSPORT_WRITE, source=source, ends_on=NEXT_MONTH)

    sync_competency_rows(
        person, additional=[], removed=[PASSPORT_WRITE], source="admin"
    )

    assert protected.ends_on == NEXT_MONTH
    assert PASSPORT_WRITE in _held(person)


def test_only_the_unprotected_row_is_closed_when_they_hold_both(
    db_session: Session,
) -> None:
    """Each row is judged by its own source, and one current row is enough."""
    person = _person(db_session, "person")
    from_an_admin = _row(person, PASSPORT_WRITE, source="admin")
    from_cover = _row(person, PASSPORT_WRITE, source="organisation")

    sync_competency_rows(person, additional=[], removed=[], source="admin")

    assert from_an_admin.ends_on is not None
    assert from_cover.ends_on is None
    assert PASSPORT_WRITE in _held(person)


def test_a_seeded_row_is_closed_when_its_competency_is_removed(
    db_session: Session,
) -> None:
    """The profession seeded it, and that does not protect it."""
    person = _person(db_session, "person")
    seeded = _only_row(person, OWN_RECORD)

    sync_competency_rows(
        person, additional=[], removed=[OWN_RECORD], source="admin"
    )

    assert seeded.ends_on is not None
    assert _held(person) == set()
    assert person.removed_competency_ids == [OWN_RECORD]


def test_no_longer_removing_a_template_competency_seeds_it_again(
    db_session: Session,
) -> None:
    """As a new profession row: the closed one is not opened again."""
    person = _person(db_session, "person")
    sync_competency_rows(
        person, additional=[], removed=[OWN_RECORD], source="admin"
    )

    sync_competency_rows(person, additional=[], removed=[], source="admin")

    closed, reopened = _rows(person, OWN_RECORD)

    assert closed.ends_on is not None
    assert reopened.ends_on is None
    assert reopened.source == PROFESSION_SOURCE
    assert person.removed_competency_ids == []


def test_a_profession_change_given_what_was_kept_adds_rows_and_closes_none(
    db_session: Session,
) -> None:
    """The lists are read against the new profession, set before the save."""
    person = _person(db_session, "person")
    _row(person, DEATH, source="admin")
    kept = competencies_kept_across_profession_change(
        person.additional_competency_ids,
        old_profession="patient",
        new_profession="registered_nurse",
    )
    template = set(get_profession_base_competencies("registered_nurse"))

    person.base_profession = "registered_nurse"
    sync_competency_rows(person, additional=kept, removed=[], source="admin")

    assert _closed(person) == []
    assert _held(person) == template | {OWN_RECORD, DEATH}
    assert len(person.competency_grants) == len(template) + 2
    for competency_id in template:
        assert _only_row(person, competency_id).source == PROFESSION_SOURCE


def test_losing_a_competency_ends_its_practice_everywhere_and_no_other(
    db_session: Session,
) -> None:
    here = _place(db_session, "Trust")
    there = _place(db_session, "Other trust")
    person = _person(db_session, "person")
    sync_competency_rows(
        person, additional=[DEATH, CREMATION], removed=[], source="admin"
    )
    _authorise(db_session, person, here, DEATH)
    _authorise(db_session, person, there, DEATH)
    _authorise(db_session, person, here, CREMATION)

    sync_competency_rows(
        person, additional=[CREMATION], removed=[], source="admin"
    )

    assert _practice(db_session, person) == {(here.id, CREMATION)}


def test_getting_a_competency_back_does_not_bring_its_practice_back(
    db_session: Session,
) -> None:
    """Each place authorises it again: nobody there decided this time."""
    here = _place(db_session, "Trust")
    person = _person(db_session, "person")
    sync_competency_rows(
        person, additional=[DEATH], removed=[], source="admin"
    )
    _authorise(db_session, person, here, DEATH)
    sync_competency_rows(person, additional=[], removed=[], source="admin")

    sync_competency_rows(
        person, additional=[DEATH], removed=[], source="admin"
    )

    assert DEATH in _held(person)
    assert _practice(db_session, person) == set()


def test_a_save_that_takes_nothing_away_leaves_practice_alone(
    db_session: Session,
) -> None:
    here = _place(db_session, "Trust")
    person = _person(db_session, "person")
    sync_competency_rows(
        person, additional=[DEATH], removed=[], source="admin"
    )
    _authorise(db_session, person, here, DEATH)

    sync_competency_rows(
        person, additional=[DEATH, CREMATION], removed=[], source="admin"
    )

    assert _practice(db_session, person) == {(here.id, DEATH)}


def test_a_protected_grant_keeps_its_practice_through_an_admin_save(
    db_session: Session,
) -> None:
    """The row was not closed, so they still hold it and keep the practice."""
    here = _place(db_session, "Trust")
    person = _person(db_session, "person")
    _row(person, DEATH, source="organisation")
    db_session.flush()
    _authorise(db_session, person, here, DEATH)

    sync_competency_rows(person, additional=[], removed=[], source="admin")

    assert _practice(db_session, person) == {(here.id, DEATH)}


@pytest.mark.parametrize("in_session", [False, True])
def test_somebody_not_yet_saved_is_given_rows_and_has_no_practice_to_lose(
    db_session: Session, in_session: bool
) -> None:
    """With no session, or one that has not given them an id yet."""
    person = _unsaved("person")

    if in_session:
        db_session.add(person)

    sync_competency_rows(
        person, additional=[DEATH], removed=[OWN_RECORD], source="admin"
    )

    assert person.id is None
    assert _held(person) == {DEATH}
    assert _only_row(person, OWN_RECORD).ends_on is not None
