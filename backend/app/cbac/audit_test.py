"""Finding stored competency ids the catalogue lacks or has retired."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import CursorResult, insert
from sqlalchemy.orm import Session

from app.cbac import audit
from app.cbac.audit import (
    _current_ids_by_user,
    retired_ids_in_practising_competencies,
    retired_ids_on_users,
    unknown_ids_in_base_professions,
    unknown_ids_in_practising_competencies,
    unknown_ids_on_users,
    unseeded_profession_competencies,
)
from app.cbac.base_professions import (
    BaseProfessionEntry,
    get_profession_base_competencies,
)
from app.models import OrgUnit, PractisingCompetency, User, UserCompetency
from tests.competencies import withhold

NOW = datetime.now(UTC)
STARTED = NOW - timedelta(days=60)
YESTERDAY = NOW - timedelta(days=1)
NEXT_MONTH = NOW + timedelta(days=30)

#: What the patient profession seeds, and so what a new patient holds.
OWN_RECORD = "access_own_patient_records"
REAL = "certify_death"
ALSO_REAL = "perform_venepuncture"
#: Retired in the shipped catalogue: still known, no longer granted.
RETIRED = "access_clinician_passport"
MADE_UP = "prescribe_moonbeams"
ALSO_MADE_UP = "certify_unicorns"


def _person(
    db: Session,
    username: str,
    *,
    profession: str = "patient",
    seeded: bool = True,
) -> User:
    """A user. ``seeded=False`` drops the rows their profession gave."""
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

    db.add(user)
    db.flush()

    return user


def _grant(
    db: Session,
    user: User,
    competency_id: str,
    *,
    ends_on: datetime | None = None,
) -> None:
    """One grant row. Nothing checks the id, which is why the audit exists."""
    user.competency_grants.append(
        UserCompetency(
            competency_id=competency_id,
            starts_on=STARTED,
            ends_on=ends_on,
            source="admin",
        )
    )
    db.flush()


def _place(db: Session) -> OrgUnit:
    place = OrgUnit(name="Trust", type="organisation")
    db.add(place)
    db.flush()

    return place


def _practising(
    db: Session, user: User, place: OrgUnit, competency: str
) -> int:
    """A practising row, written past the model's check on the id.

    The model refuses an unknown or retired id when a row is made, so a
    row only comes to name one when the catalogue changes afterwards. An
    insert that does not go through the model stands in for that.
    """
    result = db.execute(
        insert(PractisingCompetency).values(
            user_id=user.id,
            org_unit_id=place.id,
            competency=competency,
            authorised_at=NOW,
        )
    )
    assert isinstance(result, CursorResult)

    key = result.inserted_primary_key
    assert key is not None
    (row_id,) = key

    return int(row_id)


def _profession(profession_id: str, *ids: str) -> BaseProfessionEntry:
    return BaseProfessionEntry(
        id=profession_id,
        display_name=profession_id,
        description="A stand-in",
        requires_clinical_services=False,
        base_competencies=list(ids),
    )


def test_a_profession_naming_an_id_the_catalogue_lacks_is_reported(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Only the profession that has drifted, and only the id that is wrong."""
    monkeypatch.setattr(
        audit,
        "BASE_PROFESSIONS",
        [_profession("sound", REAL), _profession("drifted", REAL, MADE_UP)],
    )

    assert unknown_ids_in_base_professions() == {"drifted": [MADE_UP]}


def test_a_professions_unknown_ids_come_back_sorted_and_once_each(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        audit,
        "BASE_PROFESSIONS",
        [_profession("drifted", MADE_UP, ALSO_MADE_UP, MADE_UP)],
    )

    assert unknown_ids_in_base_professions() == {
        "drifted": [ALSO_MADE_UP, MADE_UP]
    }


def test_a_profession_granting_nothing_or_a_retired_id_is_not_reported(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A retired id is still in the catalogue, so it is not drift."""
    monkeypatch.setattr(
        audit,
        "BASE_PROFESSIONS",
        [_profession("empty"), _profession("long_standing", RETIRED)],
    )

    assert unknown_ids_in_base_professions() == {}


def test_no_professions_at_all_reports_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(audit, "BASE_PROFESSIONS", [])

    assert unknown_ids_in_base_professions() == {}


def test_with_nobody_and_no_rows_every_report_is_empty(
    db_session: Session,
) -> None:
    assert _current_ids_by_user(db_session) == {}
    assert unknown_ids_on_users(db_session) == {}
    assert retired_ids_on_users(db_session) == {}
    assert unknown_ids_in_practising_competencies(db_session) == {}
    assert retired_ids_in_practising_competencies(db_session) == {}
    assert unseeded_profession_competencies(db_session) == {}


def test_current_ids_are_gathered_for_each_person_and_sorted(
    db_session: Session,
) -> None:
    first = _person(db_session, "first")
    second = _person(db_session, "second")
    _grant(db_session, first, ALSO_REAL)
    _grant(db_session, first, REAL)
    _grant(db_session, second, MADE_UP)

    assert _current_ids_by_user(db_session) == {
        first.id: [OWN_RECORD, REAL, ALSO_REAL],
        second.id: [OWN_RECORD, MADE_UP],
    }


def test_a_closed_row_is_left_out_and_one_ending_later_is_kept(
    db_session: Session,
) -> None:
    person = _person(db_session, "person", seeded=False)
    _grant(db_session, person, REAL, ends_on=YESTERDAY)
    _grant(db_session, person, ALSO_REAL, ends_on=NEXT_MONTH)

    assert _current_ids_by_user(db_session) == {person.id: [ALSO_REAL]}


def test_two_current_rows_for_one_competency_are_listed_once(
    db_session: Session,
) -> None:
    """Nothing stops somebody holding one competency through two grants."""
    person = _person(db_session, "person", seeded=False)
    _grant(db_session, person, REAL)
    _grant(db_session, person, REAL, ends_on=NEXT_MONTH)

    assert _current_ids_by_user(db_session) == {person.id: [REAL]}


def test_a_closed_row_does_not_hide_a_current_one_for_the_same_id(
    db_session: Session,
) -> None:
    person = _person(db_session, "person", seeded=False)
    _grant(db_session, person, REAL, ends_on=YESTERDAY)
    _grant(db_session, person, REAL)

    assert _current_ids_by_user(db_session) == {person.id: [REAL]}


def test_somebody_whose_rows_have_all_closed_is_not_listed(
    db_session: Session,
) -> None:
    person = _person(db_session, "person", seeded=False)
    _grant(db_session, person, REAL, ends_on=YESTERDAY)
    nobody = _person(db_session, "nobody", seeded=False)

    found = _current_ids_by_user(db_session)

    assert person.id not in found
    assert nobody.id not in found


def test_only_people_with_a_stale_id_are_named_each_with_their_own(
    db_session: Session,
) -> None:
    clean = _person(db_session, "clean")
    one = _person(db_session, "one")
    two = _person(db_session, "two")
    _grant(db_session, clean, REAL)
    _grant(db_session, one, MADE_UP)
    _grant(db_session, one, REAL)
    _grant(db_session, two, MADE_UP)
    _grant(db_session, two, ALSO_MADE_UP)

    assert unknown_ids_on_users(db_session) == {
        one.id: [MADE_UP],
        two.id: [ALSO_MADE_UP, MADE_UP],
    }


def test_a_stale_id_on_a_closed_row_is_not_reported(
    db_session: Session,
) -> None:
    """It records what somebody could once do, and misleads nobody now."""
    person = _person(db_session, "person")
    _grant(db_session, person, MADE_UP, ends_on=YESTERDAY)

    assert unknown_ids_on_users(db_session) == {}


def test_a_stale_id_on_a_row_still_running_is_reported(
    db_session: Session,
) -> None:
    person = _person(db_session, "person")
    _grant(db_session, person, MADE_UP, ends_on=NEXT_MONTH)

    assert unknown_ids_on_users(db_session) == {person.id: [MADE_UP]}


def test_a_retired_id_on_a_user_is_queued_and_is_not_called_unknown(
    db_session: Session,
) -> None:
    """Retired ids stay known: the two reports must not overlap."""
    holder = _person(db_session, "holder")
    other = _person(db_session, "other")
    _grant(db_session, holder, RETIRED)
    _grant(db_session, holder, REAL)
    _grant(db_session, other, REAL)

    assert retired_ids_on_users(db_session) == {holder.id: [RETIRED]}
    assert unknown_ids_on_users(db_session) == {}


def test_an_unknown_id_on_a_user_is_not_queued_as_retired(
    db_session: Session,
) -> None:
    person = _person(db_session, "person")
    _grant(db_session, person, MADE_UP)

    assert retired_ids_on_users(db_session) == {}


def test_a_retired_id_on_a_closed_row_is_not_queued(
    db_session: Session,
) -> None:
    """The queue is of practice still going on, and this has ended."""
    person = _person(db_session, "person")
    _grant(db_session, person, RETIRED, ends_on=YESTERDAY)

    assert retired_ids_on_users(db_session) == {}


def test_a_practising_row_naming_a_stale_id_is_reported_by_its_own_id(
    db_session: Session,
) -> None:
    place = _place(db_session)
    person = _person(db_session, "person")
    _practising(db_session, person, place, REAL)
    stale = _practising(db_session, person, place, MADE_UP)

    assert unknown_ids_in_practising_competencies(db_session) == {
        stale: MADE_UP
    }


def test_each_stale_practising_row_is_reported_separately(
    db_session: Session,
) -> None:
    """Keyed by row, not by person: each row is one thing to put right."""
    place = _place(db_session)
    person = _person(db_session, "person")
    other = _person(db_session, "other")
    first = _practising(db_session, person, place, MADE_UP)
    second = _practising(db_session, person, place, ALSO_MADE_UP)
    third = _practising(db_session, other, place, MADE_UP)

    assert unknown_ids_in_practising_competencies(db_session) == {
        first: MADE_UP,
        second: ALSO_MADE_UP,
        third: MADE_UP,
    }


def test_a_stale_practising_row_is_reported_whatever_the_person_holds(
    db_session: Session,
) -> None:
    """The row is walked as stored: no ceiling is applied to it."""
    place = _place(db_session)
    person = _person(db_session, "person", seeded=False)
    stale = _practising(db_session, person, place, MADE_UP)

    assert unknown_ids_in_practising_competencies(db_session) == {
        stale: MADE_UP
    }


def test_a_retired_practising_row_is_queued_and_is_not_called_unknown(
    db_session: Session,
) -> None:
    place = _place(db_session)
    person = _person(db_session, "person")
    _practising(db_session, person, place, REAL)
    retired = _practising(db_session, person, place, RETIRED)

    assert retired_ids_in_practising_competencies(db_session) == {
        retired: RETIRED
    }
    assert unknown_ids_in_practising_competencies(db_session) == {}


def test_an_unknown_practising_row_is_not_queued_as_retired(
    db_session: Session,
) -> None:
    place = _place(db_session)
    person = _person(db_session, "person")
    _practising(db_session, person, place, MADE_UP)

    assert retired_ids_in_practising_competencies(db_session) == {}


def test_somebody_missing_part_of_their_template_is_named_for_that_part(
    db_session: Session,
) -> None:
    template = get_profession_base_competencies("registered_nurse")
    nurse = _person(
        db_session, "nurse", profession="registered_nurse", seeded=False
    )

    for competency_id in template[:3]:
        _grant(db_session, nurse, competency_id)

    assert unseeded_profession_competencies(db_session) == {
        nurse.id: sorted(template[3:])
    }


def test_only_the_people_missing_something_are_named(
    db_session: Session,
) -> None:
    _person(db_session, "seeded", profession="registered_nurse")
    unseeded = _person(db_session, "unseeded", seeded=False)

    assert unseeded_profession_competencies(db_session) == {
        unseeded.id: [OWN_RECORD]
    }


def test_a_template_competency_whose_row_has_closed_has_no_row_behind_it(
    db_session: Session,
) -> None:
    """Taken away and never seeded read the same: no current row."""
    person = _person(db_session, "person")
    withhold(person, OWN_RECORD)
    db_session.flush()

    assert unseeded_profession_competencies(db_session) == {
        person.id: [OWN_RECORD]
    }


def test_a_template_competency_on_a_row_ending_later_is_covered(
    db_session: Session,
) -> None:
    person = _person(db_session, "person", seeded=False)
    _grant(db_session, person, OWN_RECORD, ends_on=NEXT_MONTH)

    assert unseeded_profession_competencies(db_session) == {}


def test_a_row_from_any_source_covers_a_template_competency(
    db_session: Session,
) -> None:
    """The check is for a row, not for one the profession wrote."""
    person = _person(db_session, "person", seeded=False)
    _grant(db_session, person, OWN_RECORD)

    assert unseeded_profession_competencies(db_session) == {}


def test_what_somebody_holds_beyond_their_template_is_not_looked_at(
    db_session: Session,
) -> None:
    person = _person(db_session, "person")
    _grant(db_session, person, REAL)
    _grant(db_session, person, MADE_UP)

    assert unseeded_profession_competencies(db_session) == {}


def test_a_profession_the_file_does_not_define_has_no_template_to_miss(
    db_session: Session,
) -> None:
    _person(db_session, "person", profession="no_such_profession")

    assert unseeded_profession_competencies(db_session) == {}
