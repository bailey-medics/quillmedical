"""Who may take which organisation's modules, asked of access.py itself."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.teaching.access import (
    MISSING_COMPETENCY,
    MISSING_ENROLMENT,
    MISSING_PLACE,
    MODULES_COMPETENCY,
    RESULTS_COMPETENCY,
    Admitted,
    BankOnShow,
    BelongsNowhere,
    DelegatesInView,
    NotServed,
    ServedModule,
    admit,
    attempt_belonging_to,
    bank_status_on_show,
    bank_status_open_for_attempts,
    banks_on_show_to,
    delegates_in_view,
    enrol_everyone_with_a_place,
    give_place,
    may_enter_module,
    modules_open_to,
    modules_served_by,
    modules_served_where_they_belong,
    newest_copies_held_by,
    newest_copy_held_by,
    organisation_serving,
    organisations_open_for_modules,
    organisations_with_teaching_on,
    places_for_modules,
    settle_enrolments,
    why_not,
)
from app.features.teaching.enrolment import enrol, is_enrolled
from app.features.teaching.models import (
    Assessment,
    ModuleEnrolment,
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.models import (
    OrgUnit,
    OrgUnitFeature,
    OrgUnitLink,
    PractisingCompetency,
    User,
    UserCompetency,
)
from app.organisations import add_org_unit_member, remove_org_unit_member
from conftest import DETACHED_PLACE_NAME
from tests.competencies import hold, withhold

BANK = "polyps"
OTHER_BANK = "bleeding"
IN_A_MONTH = datetime.now(UTC) + timedelta(days=30)
IN_A_YEAR = datetime.now(UTC) + timedelta(days=365)


def _organisation(db: Session, name: str = "Trust") -> OrgUnit:
    org = OrgUnit(name=name, type="organisation")
    db.add(org)
    db.flush()

    return org


def _ward(db: Session, parent: OrgUnit, name: str = "Ward 9") -> OrgUnit:
    ward = OrgUnit(name=name, type="ward", parent_id=parent.id)
    db.add(ward)
    db.flush()

    return ward


def _detached_ward(db: Session) -> OrgUnit:
    """The ward conftest makes that belongs to no organisation."""
    ward = db.scalar(
        select(OrgUnit).where(OrgUnit.name == DETACHED_PLACE_NAME)
    )
    assert ward is not None

    return ward


def _person(
    db: Session, username: str, profession: str = "teaching_delegate"
) -> User:
    """Somebody who belongs nowhere. A delegate holds both competencies."""
    user = User(
        username=username,
        email=f"{username}@example.com",
        password_hash="x",
        is_active=True,
        email_verified=True,
        base_profession=profession,
    )
    db.add(user)
    db.flush()

    return user


def _place(db: Session, user: User, unit: OrgUnit) -> None:
    """The row alone, with no membership and no question of the ceiling."""
    db.add(
        PractisingCompetency(
            user_id=user.id,
            org_unit_id=unit.id,
            competency=MODULES_COMPETENCY,
        )
    )
    db.flush()


def _member(
    db: Session, username: str, unit: OrgUnit, profession: str = "consultant"
) -> User:
    """A member of *unit* with no place. A consultant holds nothing here."""
    user = _person(db, username, profession)
    add_org_unit_member(db, unit.id, user.id, "staff")

    return user


def _learner(db: Session, username: str, unit: OrgUnit) -> User:
    """A delegate who belongs to *unit* and has a place there."""
    user = _member(db, username, unit, "teaching_delegate")
    _place(db, user, unit)

    return user


def _serve(
    db: Session,
    org: OrgUnit,
    bank_id: str = BANK,
    *,
    active_version: int | None = 1,
    is_live: bool = True,
) -> None:
    db.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=bank_id,
            is_live=is_live,
            active_version=active_version,
        )
    )
    db.flush()


def _enrol(db: Session, user: User, org: OrgUnit, bank_id: str = BANK) -> None:
    enrol(
        db,
        user.id,
        org_unit_id=org.id,
        question_bank_id=bank_id,
        source="admin",
    )


def _enrolments(db: Session, user: User) -> list[ModuleEnrolment]:
    """Every enrolment row they have, ended or not, oldest first."""
    return list(
        db.scalars(
            select(ModuleEnrolment)
            .where(ModuleEnrolment.user_id == user.id)
            .order_by(ModuleEnrolment.id)
        ).all()
    )


def _place_rows(db: Session, user: User) -> list[PractisingCompetency]:
    return list(
        db.scalars(
            select(PractisingCompetency)
            .where(
                PractisingCompetency.user_id == user.id,
                PractisingCompetency.competency == MODULES_COMPETENCY,
            )
            .order_by(PractisingCompetency.org_unit_id)
        ).all()
    )


def _grant(user: User, competency_id: str) -> UserCompetency:
    """Their one current row for a competency."""
    now = datetime.now(UTC)
    rows = [
        row
        for row in user.competency_grants
        if row.competency_id == competency_id and row.is_current(now)
    ]
    assert len(rows) == 1

    return rows[0]


def _same_moment(found: datetime | None, expected: datetime) -> bool:
    """SQLite hands back a naive value where Postgres gives an aware one."""
    assert found is not None
    if found.tzinfo is None:
        found = found.replace(tzinfo=UTC)

    return found == expected


# --- places_for_modules -----------------------------------------------------


def test_places_are_the_rows_where_they_belong_in_ascending_order(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    first = _ward(db_session, org, "Ward 1")
    second = _ward(db_session, org, "Ward 2")
    learner = _person(db_session, "learner")

    for unit in (second, org, first):
        add_org_unit_member(db_session, unit.id, learner.id, "trainee")
        _place(db_session, learner, unit)

    assert places_for_modules(db_session, learner) == [
        org.id,
        first.id,
        second.id,
    ]


def test_somebody_with_no_rows_has_no_places(db_session: Session) -> None:
    org = _organisation(db_session)
    learner = _member(db_session, "learner", org, "teaching_delegate")

    assert places_for_modules(db_session, learner) == []


def test_a_row_where_they_do_not_belong_is_not_a_place(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    ward = _ward(db_session, org)
    learner = _learner(db_session, "learner", org)
    _place(db_session, learner, ward)

    assert places_for_modules(db_session, learner) == [org.id]


def test_leaving_a_place_closes_it_with_the_row_still_there(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)

    remove_org_unit_member(db_session, org.id, learner.id)

    assert places_for_modules(db_session, learner) == []
    assert len(_place_rows(db_session, learner)) == 1


def test_a_row_does_nothing_without_the_competency(
    db_session: Session,
) -> None:
    """The ceiling comes first, whatever the rows say."""
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)

    withhold(learner, MODULES_COMPETENCY)

    assert places_for_modules(db_session, learner) == []


def test_a_row_for_another_competency_is_not_a_place(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _member(db_session, "learner", org, "teaching_delegate")
    db_session.add(
        PractisingCompetency(
            user_id=learner.id,
            org_unit_id=org.id,
            competency=RESULTS_COMPETENCY,
        )
    )
    db_session.flush()

    assert places_for_modules(db_session, learner) == []


def test_another_persons_row_is_not_their_place(db_session: Session) -> None:
    org = _organisation(db_session)
    _learner(db_session, "colleague", org)
    learner = _member(db_session, "learner", org, "teaching_delegate")

    assert places_for_modules(db_session, learner) == []


# --- organisations_open_for_modules -----------------------------------------


def test_a_place_at_an_organisation_opens_that_organisation(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _organisation(db_session, "Another Trust")
    learner = _learner(db_session, "learner", org)

    assert organisations_open_for_modules(db_session, learner) == [org.id]


def test_a_place_at_a_ward_opens_the_organisation_and_not_the_ward(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    ward = _ward(db_session, org)
    learner = _learner(db_session, "learner", ward)

    assert organisations_open_for_modules(db_session, learner) == [org.id]


def test_places_under_two_organisations_open_both_in_ascending_order(
    db_session: Session,
) -> None:
    first = _organisation(db_session, "First Trust")
    second = _organisation(db_session, "Second Trust")
    learner = _learner(db_session, "learner", _ward(db_session, second))
    add_org_unit_member(db_session, first.id, learner.id, "trainee")
    _place(db_session, learner, first)

    assert organisations_open_for_modules(db_session, learner) == [
        first.id,
        second.id,
    ]


def test_a_place_reaches_across_a_teaching_link(db_session: Session) -> None:
    school = _organisation(db_session, "Medical School")
    trust = _organisation(db_session, "Trust")
    db_session.add(
        OrgUnitLink(
            source_id=school.id, target_id=trust.id, relation="teaches_at"
        )
    )
    learner = _learner(db_session, "learner", school)

    assert organisations_open_for_modules(db_session, learner) == [
        school.id,
        trust.id,
    ]


def test_membership_reaches_nowhere_without_a_place(
    db_session: Session,
) -> None:
    """Reach starts from the places holding a row, not every membership."""
    school = _organisation(db_session, "Medical School")
    trust = _organisation(db_session, "Trust")
    db_session.add(
        OrgUnitLink(
            source_id=school.id, target_id=trust.id, relation="teaches_at"
        )
    )
    learner = _member(db_session, "learner", school, "teaching_delegate")

    assert organisations_open_for_modules(db_session, learner) == []


def test_a_place_under_no_organisation_opens_nothing(
    db_session: Session,
) -> None:
    ward = _detached_ward(db_session)
    learner = _learner(db_session, "learner", ward)

    assert places_for_modules(db_session, learner) == [ward.id]
    assert organisations_open_for_modules(db_session, learner) == []


# --- give_place -------------------------------------------------------------


def test_giving_a_place_writes_the_row_and_who_decided_it(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    admin = _person(db_session, "admin", "teaching_admin")
    learner = _member(db_session, "learner", org, "teaching_delegate")

    give_place(db_session, learner, org.id, authorised_by=admin.id)

    rows = _place_rows(db_session, learner)
    assert [(row.org_unit_id, row.authorised_by) for row in rows] == [
        (org.id, admin.id)
    ]
    assert places_for_modules(db_session, learner) == [org.id]


def test_a_place_given_with_nobody_signed_in_names_nobody(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _member(db_session, "learner", org, "teaching_delegate")

    give_place(db_session, learner, org.id)

    assert _place_rows(db_session, learner)[0].authorised_by is None


def test_giving_a_place_twice_keeps_the_first_row(db_session: Session) -> None:
    org = _organisation(db_session)
    admin = _person(db_session, "admin", "teaching_admin")
    learner = _member(db_session, "learner", org, "teaching_delegate")
    give_place(db_session, learner, org.id, authorised_by=admin.id)

    give_place(db_session, learner, org.id, authorised_by=None)

    rows = _place_rows(db_session, learner)
    assert len(rows) == 1
    assert rows[0].authorised_by == admin.id


def test_a_place_is_refused_to_somebody_without_the_competency(
    db_session: Session,
) -> None:
    """It says only where: the competency is the caller's to give."""
    org = _organisation(db_session)
    consultant = _member(db_session, "consultant", org)

    with pytest.raises(ValueError, match=MODULES_COMPETENCY):
        give_place(db_session, consultant, org.id)

    assert _place_rows(db_session, consultant) == []


def test_giving_a_place_does_not_make_somebody_a_member(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session, "learner")

    give_place(db_session, learner, org.id)

    assert len(_place_rows(db_session, learner)) == 1
    assert places_for_modules(db_session, learner) == []


# --- may_enter_module -------------------------------------------------------


def test_all_three_layers_let_somebody_in(db_session: Session) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _enrol(db_session, learner, org)

    assert may_enter_module(
        db_session, learner, org_unit_id=org.id, question_bank_id=BANK
    )


def test_nobody_enters_without_the_competency(db_session: Session) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _enrol(db_session, learner, org)

    withhold(learner, MODULES_COMPETENCY)

    assert not may_enter_module(
        db_session, learner, org_unit_id=org.id, question_bank_id=BANK
    )


def test_nobody_enters_without_a_place(db_session: Session) -> None:
    org = _organisation(db_session)
    learner = _member(db_session, "learner", org, "teaching_delegate")
    _enrol(db_session, learner, org)

    assert not may_enter_module(
        db_session, learner, org_unit_id=org.id, question_bank_id=BANK
    )


def test_nobody_enters_without_an_enrolment(db_session: Session) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)

    assert not may_enter_module(
        db_session, learner, org_unit_id=org.id, question_bank_id=BANK
    )


def test_an_enrolment_on_one_module_does_not_open_another(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _enrol(db_session, learner, org, OTHER_BANK)

    assert not may_enter_module(
        db_session, learner, org_unit_id=org.id, question_bank_id=BANK
    )


def test_a_module_is_entered_at_its_organisation_not_at_the_place(
    db_session: Session,
) -> None:
    """The place is the way in; the organisation is who serves it."""
    org = _organisation(db_session)
    ward = _ward(db_session, org)
    learner = _learner(db_session, "learner", ward)
    _enrol(db_session, learner, org)

    assert may_enter_module(
        db_session, learner, org_unit_id=org.id, question_bank_id=BANK
    )
    assert not may_enter_module(
        db_session, learner, org_unit_id=ward.id, question_bank_id=BANK
    )


# --- enrol_everyone_with_a_place --------------------------------------------


def test_everybody_whose_place_reaches_the_organisation_is_enrolled(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    ward = _ward(db_session, org)
    at_the_org = _learner(db_session, "at_the_org", org)
    at_a_ward = _learner(db_session, "at_a_ward", ward)

    enrolled = enrol_everyone_with_a_place(
        db_session, org_unit_id=org.id, question_bank_id=BANK, source="script"
    )

    assert enrolled == [at_the_org, at_a_ward]

    for person in (at_the_org, at_a_ward):
        rows = _enrolments(db_session, person)
        assert [
            (row.org_unit_id, row.question_bank_id, row.source) for row in rows
        ] == [(org.id, BANK, "script")]


def test_people_who_may_not_take_the_organisations_modules_are_passed_over(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    elsewhere = _organisation(db_session, "Another Trust")
    learner = _learner(db_session, "learner", org)
    _learner(db_session, "at_another_trust", elsewhere)
    _member(db_session, "member_with_no_place", org, "teaching_delegate")
    left = _learner(db_session, "left", org)
    remove_org_unit_member(db_session, org.id, left.id)
    lost_it = _learner(db_session, "lost_the_competency", org)
    withhold(lost_it, MODULES_COMPETENCY)

    enrolled = enrol_everyone_with_a_place(
        db_session, org_unit_id=org.id, question_bank_id=BANK, source="script"
    )

    assert enrolled == [learner]
    assert db_session.scalars(select(ModuleEnrolment.user_id)).all() == [
        learner.id
    ]


def test_somebody_with_two_places_is_enrolled_once(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    ward = _ward(db_session, org)
    add_org_unit_member(db_session, ward.id, learner.id, "trainee")
    _place(db_session, learner, ward)

    enrolled = enrol_everyone_with_a_place(
        db_session, org_unit_id=org.id, question_bank_id=BANK, source="script"
    )

    assert enrolled == [learner]
    assert len(_enrolments(db_session, learner)) == 1


def test_only_those_not_already_enrolled_are_enrolled_and_returned(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    already = _learner(db_session, "already", org)
    newcomer = _learner(db_session, "newcomer", org)
    _enrol(db_session, already, org)

    enrolled = enrol_everyone_with_a_place(
        db_session, org_unit_id=org.id, question_bank_id=BANK, source="script"
    )

    assert enrolled == [newcomer]
    assert [row.source for row in _enrolments(db_session, already)] == [
        "admin"
    ]


def test_an_enrolment_on_another_module_does_not_count_as_this_one(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _enrol(db_session, learner, org, OTHER_BANK)

    enrolled = enrol_everyone_with_a_place(
        db_session, org_unit_id=org.id, question_bank_id=BANK, source="script"
    )

    assert enrolled == [learner]


def test_a_dry_run_names_the_same_people_and_writes_nothing(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    first = _learner(db_session, "first", org)
    second = _learner(db_session, "second", org)

    would = enrol_everyone_with_a_place(
        db_session,
        org_unit_id=org.id,
        question_bank_id=BANK,
        source="script",
        dry_run=True,
    )

    assert would == [first, second]
    assert db_session.scalars(select(ModuleEnrolment)).all() == []


def test_with_nobody_holding_a_place_nobody_is_enrolled(
    db_session: Session,
) -> None:
    org = _organisation(db_session)

    enrolled = enrol_everyone_with_a_place(
        db_session, org_unit_id=org.id, question_bank_id=BANK, source="script"
    )

    assert enrolled == []


def test_an_unknown_source_is_refused_when_there_is_somebody_to_enrol(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)

    with pytest.raises(ValueError, match="Unknown enrolment source"):
        enrol_everyone_with_a_place(
            db_session,
            org_unit_id=org.id,
            question_bank_id=BANK,
            source="because",
        )

    assert _enrolments(db_session, learner) == []


@pytest.mark.parametrize("dry_run", [True, False])
def test_an_unknown_source_is_refused_with_nobody_to_enrol_and_on_a_dry_run(
    db_session: Session, dry_run: bool
) -> None:
    """A dry run that passed would promise a real run that then fails."""
    org = _organisation(db_session)

    with pytest.raises(ValueError, match="Unknown enrolment source"):
        enrol_everyone_with_a_place(
            db_session,
            org_unit_id=org.id,
            question_bank_id=BANK,
            source="because",
            dry_run=dry_run,
        )


# --- why_not ----------------------------------------------------------------


def test_somebody_who_may_enter_is_missing_nothing(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _enrol(db_session, learner, org)

    assert (
        why_not(db_session, learner, org_unit_id=org.id, question_bank_id=BANK)
        == []
    )


def test_somebody_with_nothing_is_missing_all_three_in_order(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    consultant = _member(db_session, "consultant", org)

    assert why_not(
        db_session, consultant, org_unit_id=org.id, question_bank_id=BANK
    ) == [MISSING_COMPETENCY, MISSING_PLACE, MISSING_ENROLMENT]


def test_a_missing_competency_is_told_apart_from_a_missing_place(
    db_session: Session,
) -> None:
    """The row is still there, so only the competency is to put right."""
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _enrol(db_session, learner, org)

    withhold(learner, MODULES_COMPETENCY)

    assert why_not(
        db_session, learner, org_unit_id=org.id, question_bank_id=BANK
    ) == [MISSING_COMPETENCY]


def test_only_the_place_is_missing_where_no_row_is_held(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _member(db_session, "learner", org, "teaching_delegate")
    _enrol(db_session, learner, org)

    assert why_not(
        db_session, learner, org_unit_id=org.id, question_bank_id=BANK
    ) == [MISSING_PLACE]


def test_a_row_where_they_no_longer_belong_is_a_missing_place(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _enrol(db_session, learner, org)

    remove_org_unit_member(db_session, org.id, learner.id)

    assert why_not(
        db_session, learner, org_unit_id=org.id, question_bank_id=BANK
    ) == [MISSING_PLACE]


def test_a_place_under_another_organisation_is_a_missing_place(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    elsewhere = _organisation(db_session, "Another Trust")
    learner = _learner(db_session, "learner", elsewhere)
    _enrol(db_session, learner, org)

    assert why_not(
        db_session, learner, org_unit_id=org.id, question_bank_id=BANK
    ) == [MISSING_PLACE]


def test_only_the_enrolment_is_missing_where_it_is(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _enrol(db_session, learner, org, OTHER_BANK)

    assert why_not(
        db_session, learner, org_unit_id=org.id, question_bank_id=BANK
    ) == [MISSING_ENROLMENT]


def test_somebody_missing_two_layers_is_told_of_both(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)

    withhold(learner, MODULES_COMPETENCY)

    assert why_not(
        db_session, learner, org_unit_id=org.id, question_bank_id=BANK
    ) == [MISSING_COMPETENCY, MISSING_ENROLMENT]


# --- modules_served_by ------------------------------------------------------


def test_an_organisation_serves_what_it_has_promoted_in_id_order(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _serve(db_session, org, "polyps")
    _serve(db_session, org, "bleeding")
    _serve(db_session, org, "colitis", active_version=3)

    assert modules_served_by(db_session, org.id) == [
        "bleeding",
        "colitis",
        "polyps",
    ]


def test_a_module_with_no_version_promoted_is_not_served(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _serve(db_session, org, "polyps")
    _serve(db_session, org, "not-promoted", active_version=None)

    assert modules_served_by(db_session, org.id) == ["polyps"]


def test_a_module_closed_to_new_attempts_is_still_served(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _serve(db_session, org, "polyps", is_live=False)

    assert modules_served_by(db_session, org.id) == ["polyps"]


def test_another_organisations_modules_are_not_served_here(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    elsewhere = _organisation(db_session, "Another Trust")
    _serve(db_session, elsewhere, "polyps")

    assert modules_served_by(db_session, org.id) == []


# --- organisation_serving ---------------------------------------------------


def test_an_organisation_serves_itself(db_session: Session) -> None:
    org = _organisation(db_session)

    assert organisation_serving(db_session, org.id) == org.id


def test_a_ward_is_served_by_the_organisation_at_the_top_of_its_tree(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    ward = _ward(db_session, org)
    bay = _ward(db_session, ward, "Bay 2")

    assert organisation_serving(db_session, ward.id) == org.id
    assert organisation_serving(db_session, bay.id) == org.id


def test_a_ward_under_no_organisation_is_served_by_none(
    db_session: Session,
) -> None:
    ward = _detached_ward(db_session)

    assert organisation_serving(db_session, ward.id) is None


def test_an_org_unit_that_does_not_exist_is_served_by_none(
    db_session: Session,
) -> None:
    assert organisation_serving(db_session, 999_999) is None


# --- admit ------------------------------------------------------------------


def test_admitting_gives_all_three_layers_and_says_what_it_wrote(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _serve(db_session, org)
    admin = _person(db_session, "admin", "teaching_admin")
    consultant = _member(db_session, "consultant", org)

    admitted = admit(
        db_session,
        consultant,
        org_unit_id=org.id,
        module_ids=[BANK],
        admitted_by=admin.id,
        source="admin",
    )

    assert admitted == Admitted(
        competencies=[RESULTS_COMPETENCY, MODULES_COMPETENCY],
        place=True,
        enrolled=[BANK],
    )
    assert may_enter_module(
        db_session, consultant, org_unit_id=org.id, question_bank_id=BANK
    )


def test_admitting_records_who_decided_and_where(db_session: Session) -> None:
    org = _organisation(db_session)
    _serve(db_session, org)
    admin = _person(db_session, "admin", "teaching_admin")
    consultant = _member(db_session, "consultant", org)

    admit(
        db_session,
        consultant,
        org_unit_id=org.id,
        module_ids=[BANK],
        admitted_by=admin.id,
        source="registration",
        ends_on=IN_A_MONTH,
    )

    for competency_id in (RESULTS_COMPETENCY, MODULES_COMPETENCY):
        grant = _grant(consultant, competency_id)
        assert (grant.source, grant.granted_by, grant.org_unit_id) == (
            "admin",
            admin.id,
            org.id,
        )

    assert _place_rows(db_session, consultant)[0].authorised_by == admin.id
    enrolment = _enrolments(db_session, consultant)[0]
    assert (enrolment.source, enrolment.granted_by) == (
        "registration",
        admin.id,
    )
    assert _same_moment(enrolment.ends_on, IN_A_MONTH)


def test_admitting_with_nobody_signed_in_names_nobody(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _serve(db_session, org)
    consultant = _member(db_session, "consultant", org)

    admit(
        db_session,
        consultant,
        org_unit_id=org.id,
        module_ids=[BANK],
        admitted_by=None,
        source="registration",
    )

    assert _grant(consultant, MODULES_COMPETENCY).granted_by is None
    assert _place_rows(db_session, consultant)[0].authorised_by is None
    assert _enrolments(db_session, consultant)[0].granted_by is None
    assert _enrolments(db_session, consultant)[0].ends_on is None


def test_admitting_again_writes_nothing_new(db_session: Session) -> None:
    org = _organisation(db_session)
    _serve(db_session, org)
    consultant = _member(db_session, "consultant", org)
    admit(
        db_session,
        consultant,
        org_unit_id=org.id,
        module_ids=[BANK],
        admitted_by=None,
        source="admin",
    )
    grants = len(consultant.competency_grants)

    again = admit(
        db_session,
        consultant,
        org_unit_id=org.id,
        module_ids=[BANK],
        admitted_by=None,
        source="admin",
    )

    assert again == Admitted(competencies=[], place=False, enrolled=[])
    assert len(consultant.competency_grants) == grants
    assert len(_place_rows(db_session, consultant)) == 1
    assert len(_enrolments(db_session, consultant)) == 1


def test_only_the_competency_they_lack_is_given(db_session: Session) -> None:
    org = _organisation(db_session)
    consultant = _member(db_session, "consultant", org)
    hold(consultant, RESULTS_COMPETENCY)

    admitted = admit(
        db_session,
        consultant,
        org_unit_id=org.id,
        module_ids=[],
        admitted_by=None,
        source="admin",
    )

    assert admitted.competencies == [MODULES_COMPETENCY]


def test_a_competency_beyond_their_profession_is_added_to_what_they_hold(
    db_session: Session,
) -> None:
    """And whatever else they held beyond it is kept."""
    org = _organisation(db_session)
    consultant = _member(db_session, "consultant", org)
    hold(consultant, "view_teaching_analytics")
    before = set(consultant.get_final_competencies())

    admit(
        db_session,
        consultant,
        org_unit_id=org.id,
        module_ids=[],
        admitted_by=None,
        source="admin",
    )

    assert set(consultant.additional_competency_ids) == {
        "view_teaching_analytics",
        RESULTS_COMPETENCY,
        MODULES_COMPETENCY,
    }
    assert set(consultant.get_final_competencies()) == before | {
        RESULTS_COMPETENCY,
        MODULES_COMPETENCY,
    }


def test_a_competency_their_profession_gives_is_restored_not_added(
    db_session: Session,
) -> None:
    """It comes off the removed list, and the row says the profession."""
    org = _organisation(db_session)
    delegate = _member(db_session, "delegate", org, "teaching_delegate")
    withhold(delegate, MODULES_COMPETENCY)
    assert delegate.removed_competency_ids == [MODULES_COMPETENCY]

    admitted = admit(
        db_session,
        delegate,
        org_unit_id=org.id,
        module_ids=[],
        admitted_by=None,
        source="admin",
    )

    assert admitted.competencies == [MODULES_COMPETENCY]
    assert delegate.removed_competency_ids == []
    assert delegate.additional_competency_ids == []
    assert _grant(delegate, MODULES_COMPETENCY).source == "profession"


def test_admitting_with_no_modules_gives_the_competencies_and_the_place(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _serve(db_session, org)
    consultant = _member(db_session, "consultant", org)

    admitted = admit(
        db_session,
        consultant,
        org_unit_id=org.id,
        module_ids=[],
        admitted_by=None,
        source="admin",
    )

    assert admitted == Admitted(
        competencies=[RESULTS_COMPETENCY, MODULES_COMPETENCY],
        place=True,
        enrolled=[],
    )
    assert places_for_modules(db_session, consultant) == [org.id]
    assert _enrolments(db_session, consultant) == []


def test_admitting_at_a_ward_places_them_there_and_enrols_at_the_organisation(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    ward = _ward(db_session, org)
    _serve(db_session, org)
    consultant = _member(db_session, "consultant", ward)

    admit(
        db_session,
        consultant,
        org_unit_id=ward.id,
        module_ids=[BANK],
        admitted_by=None,
        source="admin",
    )

    assert places_for_modules(db_session, consultant) == [ward.id]
    assert [
        row.org_unit_id for row in _enrolments(db_session, consultant)
    ] == [org.id]
    assert _grant(consultant, MODULES_COMPETENCY).org_unit_id == ward.id


def test_a_module_named_twice_is_enrolled_on_once_and_reported_in_id_order(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _serve(db_session, org, "polyps")
    _serve(db_session, org, "bleeding")
    learner = _learner(db_session, "learner", org)

    admitted = admit(
        db_session,
        learner,
        org_unit_id=org.id,
        module_ids=["polyps", "bleeding", "polyps"],
        admitted_by=None,
        source="admin",
    )

    assert admitted == Admitted(
        competencies=[], place=False, enrolled=["bleeding", "polyps"]
    )
    assert len(_enrolments(db_session, learner)) == 2


def test_a_module_they_are_already_on_is_not_reported_as_enrolled(
    db_session: Session,
) -> None:
    """Nor is its end changed: the row there keeps what it said."""
    org = _organisation(db_session)
    _serve(db_session, org, "polyps")
    _serve(db_session, org, "bleeding")
    learner = _learner(db_session, "learner", org)
    _enrol(db_session, learner, org, "polyps")

    admitted = admit(
        db_session,
        learner,
        org_unit_id=org.id,
        module_ids=["polyps", "bleeding"],
        admitted_by=None,
        source="admin",
        ends_on=IN_A_MONTH,
    )

    assert admitted.enrolled == ["bleeding"]
    ends = {
        row.question_bank_id: row.ends_on
        for row in _enrolments(db_session, learner)
    }
    assert ends["polyps"] is None
    assert _same_moment(ends["bleeding"], IN_A_MONTH)


def test_a_module_the_organisation_does_not_serve_is_refused_by_name(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _serve(db_session, org)
    _serve(db_session, org, "not-promoted", active_version=None)
    consultant = _member(db_session, "consultant", org)

    with pytest.raises(NotServed) as refused:
        admit(
            db_session,
            consultant,
            org_unit_id=org.id,
            module_ids=["unheard-of", BANK, "not-promoted"],
            admitted_by=None,
            source="admin",
        )

    assert str(refused.value) == "not-promoted, unheard-of"


def test_a_refused_admission_writes_none_of_the_three_layers(
    db_session: Session,
) -> None:
    """Not even the module that was served, or the competencies."""
    org = _organisation(db_session)
    _serve(db_session, org)
    consultant = _member(db_session, "consultant", org)
    before = set(consultant.get_final_competencies())

    with pytest.raises(NotServed):
        admit(
            db_session,
            consultant,
            org_unit_id=org.id,
            module_ids=[BANK, "unheard-of"],
            admitted_by=None,
            source="admin",
        )

    assert set(consultant.get_final_competencies()) == before
    assert _place_rows(db_session, consultant) == []
    assert _enrolments(db_session, consultant) == []


def test_another_organisations_module_is_not_served_here(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    elsewhere = _organisation(db_session, "Another Trust")
    _serve(db_session, elsewhere)
    consultant = _member(db_session, "consultant", org)

    with pytest.raises(NotServed, match=BANK):
        admit(
            db_session,
            consultant,
            org_unit_id=org.id,
            module_ids=[BANK],
            admitted_by=None,
            source="admin",
        )


def test_nobody_is_admitted_at_a_place_with_no_organisation(
    db_session: Session,
) -> None:
    """Even naming no module: there is nobody to serve them one."""
    ward = _detached_ward(db_session)
    consultant = _member(db_session, "consultant", ward)

    with pytest.raises(NotServed, match="no organisation"):
        admit(
            db_session,
            consultant,
            org_unit_id=ward.id,
            module_ids=[],
            admitted_by=None,
            source="admin",
        )

    assert MODULES_COMPETENCY not in consultant.get_final_competencies()
    assert _place_rows(db_session, consultant) == []


def test_a_refusal_can_be_caught_as_a_value_error() -> None:
    assert issubclass(NotServed, ValueError)


def test_admitting_somebody_who_does_not_belong_there_opens_nothing(
    db_session: Session,
) -> None:
    """Membership is the caller's check: the rows are written and idle."""
    org = _organisation(db_session)
    _serve(db_session, org)
    stranger = _person(db_session, "stranger", "consultant")

    admitted = admit(
        db_session,
        stranger,
        org_unit_id=org.id,
        module_ids=[BANK],
        admitted_by=None,
        source="admin",
    )

    assert admitted.place is True
    assert not may_enter_module(
        db_session, stranger, org_unit_id=org.id, question_bank_id=BANK
    )
    assert why_not(
        db_session, stranger, org_unit_id=org.id, question_bank_id=BANK
    ) == [MISSING_PLACE]


# --- settle_enrolments ------------------------------------------------------


def test_naming_a_module_gives_everything_needed_to_enter_it(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _serve(db_session, org)
    admin = _person(db_session, "admin", "teaching_admin")
    consultant = _member(db_session, "consultant", org)

    settle_enrolments(
        db_session,
        consultant,
        organisation_id=org.id,
        wanted={BANK: IN_A_MONTH},
        settled_by=admin.id,
    )

    assert may_enter_module(
        db_session, consultant, org_unit_id=org.id, question_bank_id=BANK
    )
    enrolment = _enrolments(db_session, consultant)[0]
    assert (enrolment.source, enrolment.granted_by) == ("admin", admin.id)
    assert _same_moment(enrolment.ends_on, IN_A_MONTH)


def test_a_place_is_given_at_every_org_unit_they_belong_to_under_it(
    db_session: Session,
) -> None:
    """And nowhere else: not under another organisation."""
    org = _organisation(db_session)
    ward = _ward(db_session, org)
    elsewhere = _organisation(db_session, "Another Trust")
    _serve(db_session, org)
    consultant = _member(db_session, "consultant", org)
    add_org_unit_member(db_session, ward.id, consultant.id, "staff")
    add_org_unit_member(db_session, elsewhere.id, consultant.id, "staff")

    settle_enrolments(
        db_session,
        consultant,
        organisation_id=org.id,
        wanted={BANK: None},
        settled_by=None,
    )

    assert places_for_modules(db_session, consultant) == [org.id, ward.id]
    assert len(_enrolments(db_session, consultant)) == 1


def test_a_module_not_named_has_its_enrolment_ended_and_kept(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _serve(db_session, org, "polyps")
    _serve(db_session, org, "bleeding")
    learner = _learner(db_session, "learner", org)
    _enrol(db_session, learner, org, "polyps")
    _enrol(db_session, learner, org, "bleeding")

    settle_enrolments(
        db_session,
        learner,
        organisation_id=org.id,
        wanted={"bleeding": None},
        settled_by=None,
    )

    assert not is_enrolled(
        db_session, learner.id, org_unit_id=org.id, question_bank_id="polyps"
    )
    assert is_enrolled(
        db_session, learner.id, org_unit_id=org.id, question_bank_id="bleeding"
    )
    assert len(_enrolments(db_session, learner)) == 2


def test_an_empty_list_ends_every_enrolment_and_nothing_else(
    db_session: Session,
) -> None:
    """The competency and the place stay: ending is all it does."""
    org = _organisation(db_session)
    _serve(db_session, org)
    learner = _learner(db_session, "learner", org)
    _enrol(db_session, learner, org)

    settle_enrolments(
        db_session,
        learner,
        organisation_id=org.id,
        wanted={},
        settled_by=None,
    )

    assert not is_enrolled(
        db_session, learner.id, org_unit_id=org.id, question_bank_id=BANK
    )
    assert places_for_modules(db_session, learner) == [org.id]
    assert why_not(
        db_session, learner, org_unit_id=org.id, question_bank_id=BANK
    ) == [MISSING_ENROLMENT]


def test_an_empty_list_gives_nothing_to_somebody_with_nothing(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _serve(db_session, org)
    consultant = _member(db_session, "consultant", org)

    settle_enrolments(
        db_session,
        consultant,
        organisation_id=org.id,
        wanted={},
        settled_by=None,
    )

    assert MODULES_COMPETENCY not in consultant.get_final_competencies()
    assert _place_rows(db_session, consultant) == []
    assert _enrolments(db_session, consultant) == []


def test_enrolments_at_another_organisation_are_left_alone(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    elsewhere = _organisation(db_session, "Another Trust")
    learner = _learner(db_session, "learner", org)
    _enrol(db_session, learner, elsewhere)

    settle_enrolments(
        db_session,
        learner,
        organisation_id=org.id,
        wanted={},
        settled_by=None,
    )

    assert is_enrolled(
        db_session, learner.id, org_unit_id=elsewhere.id, question_bank_id=BANK
    )


def test_a_different_end_ends_the_old_enrolment_and_writes_a_new_one(
    db_session: Session,
) -> None:
    """So the table says who changed the term."""
    org = _organisation(db_session)
    _serve(db_session, org)
    admin = _person(db_session, "admin", "teaching_admin")
    learner = _learner(db_session, "learner", org)
    _enrol(db_session, learner, org)

    settle_enrolments(
        db_session,
        learner,
        organisation_id=org.id,
        wanted={BANK: IN_A_YEAR},
        settled_by=admin.id,
    )

    old, new = _enrolments(db_session, learner)
    assert old.ends_on is not None
    assert old.granted_by is None
    assert _same_moment(new.ends_on, IN_A_YEAR)
    assert new.granted_by == admin.id
    assert is_enrolled(
        db_session, learner.id, org_unit_id=org.id, question_bank_id=BANK
    )


def test_an_end_can_be_taken_off_an_enrolment(db_session: Session) -> None:
    org = _organisation(db_session)
    _serve(db_session, org)
    learner = _learner(db_session, "learner", org)
    enrol(
        db_session,
        learner.id,
        org_unit_id=org.id,
        question_bank_id=BANK,
        source="admin",
        ends_on=IN_A_MONTH,
    )

    settle_enrolments(
        db_session,
        learner,
        organisation_id=org.id,
        wanted={BANK: None},
        settled_by=None,
    )

    _old, new = _enrolments(db_session, learner)
    assert new.ends_on is None


def test_the_same_list_again_changes_nothing(db_session: Session) -> None:
    org = _organisation(db_session)
    _serve(db_session, org)
    admin = _person(db_session, "admin", "teaching_admin")
    consultant = _member(db_session, "consultant", org)
    settle_enrolments(
        db_session,
        consultant,
        organisation_id=org.id,
        wanted={BANK: IN_A_MONTH},
        settled_by=admin.id,
    )

    settle_enrolments(
        db_session,
        consultant,
        organisation_id=org.id,
        wanted={BANK: IN_A_MONTH},
        settled_by=None,
    )

    rows = _enrolments(db_session, consultant)
    assert len(rows) == 1
    assert rows[0].granted_by == admin.id
    assert len(_place_rows(db_session, consultant)) == 1


def test_a_module_the_organisation_does_not_serve_settles_nothing(
    db_session: Session,
) -> None:
    """Refused before anything is ended, so what they had still stands."""
    org = _organisation(db_session)
    _serve(db_session, org, "polyps")
    _serve(db_session, org, "bleeding")
    learner = _learner(db_session, "learner", org)
    _enrol(db_session, learner, org, "polyps")

    with pytest.raises(NotServed) as refused:
        settle_enrolments(
            db_session,
            learner,
            organisation_id=org.id,
            wanted={"bleeding": None, "unheard-of": None, "another": None},
            settled_by=None,
        )

    assert str(refused.value) == "another, unheard-of"
    assert is_enrolled(
        db_session, learner.id, org_unit_id=org.id, question_bank_id="polyps"
    )
    assert not is_enrolled(
        db_session, learner.id, org_unit_id=org.id, question_bank_id="bleeding"
    )


def test_somebody_who_belongs_nowhere_under_the_organisation_is_refused(
    db_session: Session,
) -> None:
    """Nobody does anything without being somewhere."""
    org = _organisation(db_session)
    elsewhere = _organisation(db_session, "Another Trust")
    _serve(db_session, org)
    consultant = _member(db_session, "consultant", elsewhere)

    with pytest.raises(BelongsNowhere):
        settle_enrolments(
            db_session,
            consultant,
            organisation_id=org.id,
            wanted={BANK: None},
            settled_by=None,
        )

    assert MODULES_COMPETENCY not in consultant.get_final_competencies()
    assert _place_rows(db_session, consultant) == []
    assert _enrolments(db_session, consultant) == []


def test_ending_every_enrolment_needs_no_membership(
    db_session: Session,
) -> None:
    """Somebody who has left can still be taken off what they were on."""
    org = _organisation(db_session)
    elsewhere = _organisation(db_session, "Another Trust")
    _serve(db_session, org)
    consultant = _member(db_session, "consultant", elsewhere)
    _enrol(db_session, consultant, org, BANK)

    settle_enrolments(
        db_session,
        consultant,
        organisation_id=org.id,
        wanted={},
        settled_by=None,
    )

    assert not is_enrolled(
        db_session, consultant.id, org_unit_id=org.id, question_bank_id=BANK
    )


# --- modules_open_to --------------------------------------------------------


def _operator(db: Session, username: str = "operator") -> User:
    """Somebody who operates the deployment and belongs nowhere."""
    user = _person(db, username, "superadmin_profession")
    user.platform_role = "superadmin"
    db.flush()

    return user


def test_a_live_module_they_are_enrolled_on_is_open_through_its_organisation(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", _ward(db_session, org))
    _serve(db_session, org)
    _enrol(db_session, learner, org)

    assert modules_open_to(db_session, learner) == {BANK: org.id}


def test_every_module_open_to_them_is_named(db_session: Session) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _serve(db_session, org)
    _serve(db_session, org, OTHER_BANK)
    _enrol(db_session, learner, org)
    _enrol(db_session, learner, org, OTHER_BANK)

    assert modules_open_to(db_session, learner) == {
        BANK: org.id,
        OTHER_BANK: org.id,
    }


def test_a_module_they_are_not_enrolled_on_is_not_open(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _serve(db_session, org)
    _serve(db_session, org, OTHER_BANK)
    _enrol(db_session, learner, org)

    assert modules_open_to(db_session, learner) == {BANK: org.id}


def test_a_module_that_is_not_live_is_not_open(db_session: Session) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _serve(db_session, org, is_live=False)
    _enrol(db_session, learner, org)

    assert modules_open_to(db_session, learner) == {}


def test_a_module_of_an_organisation_beyond_their_reach_is_not_open(
    db_session: Session,
) -> None:
    """Enrolled there, even, and it stays shut without a place."""
    org = _organisation(db_session)
    elsewhere = _organisation(db_session, "Elsewhere")
    learner = _learner(db_session, "learner", org)
    _serve(db_session, elsewhere)
    _enrol(db_session, learner, elsewhere)

    assert modules_open_to(db_session, learner) == {}


def test_a_delegate_with_no_place_is_shown_no_module(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    member = _member(db_session, "member", org, "teaching_delegate")
    _serve(db_session, org)
    _enrol(db_session, member, org)

    assert modules_open_to(db_session, member) == {}


def test_a_place_opens_no_module_to_somebody_without_the_competency(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _serve(db_session, org)
    _enrol(db_session, learner, org)
    withhold(learner, MODULES_COMPETENCY)
    db_session.flush()

    assert modules_open_to(db_session, learner) == {}


def test_somebody_who_only_views_results_is_shown_no_module(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    viewer = _member(db_session, "viewer", org)
    hold(viewer, RESULTS_COMPETENCY)
    _place(db_session, viewer, org)
    _serve(db_session, org)
    _enrol(db_session, viewer, org)

    assert modules_open_to(db_session, viewer) == {}


def test_managing_teaching_at_an_organisation_opens_no_module_by_itself(
    db_session: Session,
) -> None:
    """A teaching admin learns through a place and an enrolment too."""
    org = _organisation(db_session)
    manager = _member(db_session, "manager", org, "teaching_admin")
    _serve(db_session, org)

    assert modules_open_to(db_session, manager) == {}


def test_an_operator_who_belongs_nowhere_is_shown_no_module(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _serve(db_session, org)

    assert modules_open_to(db_session, _operator(db_session)) == {}


def test_with_nothing_served_no_module_is_open(db_session: Session) -> None:
    learner = _learner(db_session, "learner", _organisation(db_session))

    assert modules_open_to(db_session, learner) == {}


# --- delegates_in_view ------------------------------------------------------


def test_a_manager_is_shown_the_members_of_their_organisation_and_its_wards(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    ward = _ward(db_session, org)
    manager = _member(db_session, "manager", org, "teaching_admin")
    at_the_trust = _member(db_session, "trust", org)
    on_the_ward = _member(db_session, "ward", ward, "teaching_delegate")

    assert delegates_in_view(
        db_session, manager, one_module=False
    ) == DelegatesInView(
        organisation_ids=[org.id],
        place_ids={ward.id},
        people_ids={at_the_trust.id, on_the_ward.id},
    )


def test_a_member_of_a_ward_beneath_a_ward_is_in_view(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    ward = _ward(db_session, org)
    bay = _ward(db_session, ward, "Bay 2")
    manager = _member(db_session, "manager", org, "teaching_admin")
    in_the_bay = _member(db_session, "bay", bay)

    view = delegates_in_view(db_session, manager, one_module=False)

    assert view.place_ids == {ward.id, bay.id}
    assert view.people_ids == {in_the_bay.id}


def test_the_caller_is_left_out_of_the_list_of_everybody(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    manager = _member(db_session, "manager", org, "teaching_admin")

    view = delegates_in_view(db_session, manager, one_module=False)

    assert view.organisation_ids == [org.id]
    assert view.people_ids == set()


def test_the_caller_is_kept_in_the_list_for_one_module(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    manager = _member(db_session, "manager", org, "teaching_admin")
    other = _member(db_session, "other", org)

    view = delegates_in_view(db_session, manager, one_module=True)

    assert view.people_ids == {manager.id, other.id}


def test_another_organisations_people_and_wards_are_out_of_view(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    elsewhere = _organisation(db_session, "Elsewhere")
    their_ward = _ward(db_session, elsewhere, "Ward 3")
    manager = _member(db_session, "manager", org, "teaching_admin")
    _member(db_session, "theirs", elsewhere)
    _member(db_session, "their-ward", their_ward)

    view = delegates_in_view(db_session, manager, one_module=False)

    assert view.organisation_ids == [org.id]
    assert view.place_ids == set()
    assert view.people_ids == set()


def test_a_manager_of_two_organisations_is_shown_both(
    db_session: Session,
) -> None:
    first = _organisation(db_session, "First")
    second = _organisation(db_session, "Second")
    manager = _member(db_session, "manager", first, "teaching_admin")
    add_org_unit_member(db_session, second.id, manager.id, "staff")
    one = _member(db_session, "one", first)
    two = _member(db_session, "two", second)

    view = delegates_in_view(db_session, manager, one_module=False)

    assert view.organisation_ids == sorted([first.id, second.id])
    assert view.people_ids == {one.id, two.id}


def test_belonging_to_a_ward_alone_shows_nobody(db_session: Session) -> None:
    """Membership of the organisation itself, not reach up to it."""
    org = _organisation(db_session)
    ward = _ward(db_session, org)
    manager = _member(db_session, "manager", ward, "teaching_admin")
    _member(db_session, "trust", org)
    _member(db_session, "ward", ward)

    assert delegates_in_view(
        db_session, manager, one_module=True
    ) == DelegatesInView(
        organisation_ids=[], place_ids=set(), people_ids=set()
    )


def test_an_operator_who_belongs_nowhere_is_shown_nobody(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _member(db_session, "trust", org)

    view = delegates_in_view(
        db_session, _operator(db_session), one_module=False
    )

    assert view.people_ids == set()


def test_who_is_in_view_does_not_ask_what_the_caller_holds(
    db_session: Session,
) -> None:
    """``manage_teaching`` is the route's question, not this one's.

    A delegate who is a trainee at the organisation gets the same
    answer a manager would. The route never lets them ask.
    """
    org = _organisation(db_session)
    delegate = _person(db_session, "delegate")
    add_org_unit_member(db_session, org.id, delegate.id, "trainee")
    other = _member(db_session, "other", org)

    view = delegates_in_view(db_session, delegate, one_module=False)

    assert view.people_ids == {other.id}


# --- modules_served_where_they_belong ---------------------------------------


def _sync(
    db: Session,
    org: OrgUnit,
    bank_id: str,
    title: str,
    version: int = 1,
) -> None:
    """One version of a module, synced into the organisation."""
    db.add(
        QuestionBankConfig(
            org_unit_id=org.id,
            question_bank_id=bank_id,
            version=version,
            title=title,
            description="A question bank.",
            type="uniform",
            config_yaml={},
        )
    )
    db.flush()


def test_served_modules_are_named_in_title_order_whatever_the_case(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    manager = _member(db_session, "manager", org, "teaching_admin")
    _serve(db_session, org, "zebra")
    _sync(db_session, org, "zebra", "anatomy")
    _serve(db_session, org, "apple")
    _sync(db_session, org, "apple", "Bleeding")

    assert modules_served_where_they_belong(db_session, manager) == [
        ServedModule(module_id="zebra", title="anatomy"),
        ServedModule(module_id="apple", title="Bleeding"),
    ]


def test_two_modules_with_one_title_are_in_id_order(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    manager = _member(db_session, "manager", org, "teaching_admin")
    _serve(db_session, org, "second")
    _sync(db_session, org, "second", "Polyps")
    _serve(db_session, org, "first")
    _sync(db_session, org, "first", "Polyps")

    assert [
        module.module_id
        for module in modules_served_where_they_belong(db_session, manager)
    ] == ["first", "second"]


def test_a_module_is_named_by_the_version_being_served(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    manager = _member(db_session, "manager", org, "teaching_admin")
    _serve(db_session, org, active_version=1)
    _sync(db_session, org, BANK, "Served title", version=1)
    _sync(db_session, org, BANK, "Later title", version=2)

    assert modules_served_where_they_belong(db_session, manager) == [
        ServedModule(module_id=BANK, title="Served title")
    ]


def test_a_module_that_was_only_synced_is_not_listed(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    manager = _member(db_session, "manager", org, "teaching_admin")
    _serve(db_session, org, active_version=None)
    _sync(db_session, org, BANK, "Polyps")

    assert modules_served_where_they_belong(db_session, manager) == []


def test_a_served_module_closed_to_new_attempts_is_still_listed(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    manager = _member(db_session, "manager", org, "teaching_admin")
    _serve(db_session, org, is_live=False)
    _sync(db_session, org, BANK, "Polyps")

    assert modules_served_where_they_belong(db_session, manager) == [
        ServedModule(module_id=BANK, title="Polyps")
    ]


def test_a_served_version_with_nothing_synced_to_name_it_is_left_out(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    manager = _member(db_session, "manager", org, "teaching_admin")
    _serve(db_session, org, active_version=2)
    _sync(db_session, org, BANK, "Polyps", version=1)

    assert modules_served_where_they_belong(db_session, manager) == []


def test_another_organisations_modules_are_not_listed_for_a_manager(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    elsewhere = _organisation(db_session, "Elsewhere")
    manager = _member(db_session, "manager", org, "teaching_admin")
    _serve(db_session, elsewhere)
    _sync(db_session, elsewhere, BANK, "Polyps")

    assert modules_served_where_they_belong(db_session, manager) == []


def test_with_nothing_served_no_module_is_listed(db_session: Session) -> None:
    org = _organisation(db_session)
    manager = _member(db_session, "manager", org, "teaching_admin")
    _sync(db_session, org, BANK, "Polyps")

    assert modules_served_where_they_belong(db_session, manager) == []


def test_belonging_to_a_ward_alone_lists_no_module(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    manager = _member(
        db_session, "manager", _ward(db_session, org), "teaching_admin"
    )
    _serve(db_session, org)
    _sync(db_session, org, BANK, "Polyps")

    assert modules_served_where_they_belong(db_session, manager) == []


def test_an_operator_who_belongs_nowhere_is_listed_no_module(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _serve(db_session, org)
    _sync(db_session, org, BANK, "Polyps")

    assert (
        modules_served_where_they_belong(db_session, _operator(db_session))
        == []
    )


# --- banks_on_show_to -------------------------------------------------------


def _second_place(db: Session, user: User, unit: OrgUnit) -> None:
    """Have *user* belong to another org unit, with a place there too."""
    add_org_unit_member(db, unit.id, user.id, "staff")
    _place(db, user, unit)


def test_a_bank_they_are_enrolled_on_is_on_show_at_its_promoted_version(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", _ward(db_session, org))
    _serve(db_session, org, active_version=3)
    _enrol(db_session, learner, org)

    assert banks_on_show_to(db_session, learner) == {
        BANK: BankOnShow(version=3, is_live=True, organisation_id=org.id)
    }


def test_a_bank_closed_to_new_attempts_is_on_show_and_said_to_be_closed(
    db_session: Session,
) -> None:
    """Where ``modules_open_to`` leaves it out, this does not."""
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _serve(db_session, org, is_live=False)
    _enrol(db_session, learner, org)

    assert banks_on_show_to(db_session, learner) == {
        BANK: BankOnShow(version=1, is_live=False, organisation_id=org.id)
    }


def test_a_bank_with_no_version_promoted_is_not_on_show(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _serve(db_session, org, active_version=None)
    _enrol(db_session, learner, org)

    assert banks_on_show_to(db_session, learner) == {}


def test_a_bank_they_are_not_enrolled_on_is_not_on_show(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _serve(db_session, org)
    _serve(db_session, org, OTHER_BANK)
    _enrol(db_session, learner, org)

    assert list(banks_on_show_to(db_session, learner)) == [BANK]


def test_a_bank_of_an_organisation_beyond_their_reach_is_not_on_show(
    db_session: Session,
) -> None:
    """Enrolled there, even, and it is not shown without a place."""
    org = _organisation(db_session)
    elsewhere = _organisation(db_session, "Elsewhere")
    learner = _learner(db_session, "learner", org)
    _serve(db_session, elsewhere)
    _enrol(db_session, learner, elsewhere)

    assert banks_on_show_to(db_session, learner) == {}


def test_a_delegate_with_no_place_is_shown_no_bank(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    member = _member(db_session, "member", org, "teaching_delegate")
    _serve(db_session, org)
    _enrol(db_session, member, org)

    assert banks_on_show_to(db_session, member) == {}


def test_somebody_who_only_views_results_is_shown_no_bank(
    db_session: Session,
) -> None:
    """The list is reached with the results competency alone."""
    org = _organisation(db_session)
    viewer = _member(db_session, "viewer", org)
    hold(viewer, RESULTS_COMPETENCY)
    _place(db_session, viewer, org)
    _serve(db_session, org)
    _enrol(db_session, viewer, org)

    assert banks_on_show_to(db_session, viewer) == {}


def test_a_bank_two_organisations_serve_shows_the_highest_version_and_is_live(
    db_session: Session,
) -> None:
    """Live at either is live, and the higher version is the one shown.

    The organisation named is whichever row the database gave first, so
    it is only said here to be one of the two.
    """
    closed = _organisation(db_session, "Closed Trust")
    live = _organisation(db_session, "Live Trust")
    learner = _learner(db_session, "learner", closed)
    _second_place(db_session, learner, live)
    _serve(db_session, closed, active_version=5, is_live=False)
    _serve(db_session, live, active_version=2)
    _enrol(db_session, learner, closed)
    _enrol(db_session, learner, live)

    on_show = banks_on_show_to(db_session, learner)[BANK]

    assert on_show.version == 5
    assert on_show.is_live is True
    assert on_show.organisation_id in {closed.id, live.id}


def test_an_organisation_with_no_version_promoted_adds_nothing_to_a_bank(
    db_session: Session,
) -> None:
    """Not its being live, and not its name for the media question."""
    nothing_promoted = _organisation(db_session, "Nothing Promoted")
    serving = _organisation(db_session, "Serving")
    learner = _learner(db_session, "learner", nothing_promoted)
    _second_place(db_session, learner, serving)
    _serve(db_session, nothing_promoted, active_version=None)
    _serve(db_session, serving, active_version=2, is_live=False)
    _enrol(db_session, learner, nothing_promoted)
    _enrol(db_session, learner, serving)

    assert banks_on_show_to(db_session, learner) == {
        BANK: BankOnShow(version=2, is_live=False, organisation_id=serving.id)
    }


# --- bank_status_on_show ----------------------------------------------------


def test_the_row_for_a_bank_they_are_enrolled_on_is_given(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _serve(db_session, org, active_version=4)
    _enrol(db_session, learner, org)

    row = bank_status_on_show(
        db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
    )

    assert row is not None
    assert (row.org_unit_id, row.question_bank_id) == (org.id, BANK)
    assert row.active_version == 4


def test_a_row_is_given_whether_or_not_the_bank_is_live_or_promoted(
    db_session: Session,
) -> None:
    """Both are left for the caller to ask."""
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _serve(db_session, org, active_version=None, is_live=False)
    _enrol(db_session, learner, org)

    row = bank_status_on_show(
        db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
    )

    assert row is not None
    assert row.active_version is None
    assert row.is_live is False


def test_no_row_is_given_for_a_bank_they_are_not_enrolled_on(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _serve(db_session, org)

    assert (
        bank_status_on_show(
            db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
        )
        is None
    )


def test_no_row_is_given_for_another_bank_than_the_one_asked_about(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _serve(db_session, org)
    _enrol(db_session, learner, org)

    assert (
        bank_status_on_show(
            db_session,
            learner.id,
            organisation_ids=[org.id],
            bank_id=OTHER_BANK,
        )
        is None
    )


def test_no_row_is_given_from_an_organisation_that_was_not_named(
    db_session: Session,
) -> None:
    """Enrolled there, and it is still not one of theirs to ask."""
    org = _organisation(db_session)
    elsewhere = _organisation(db_session, "Elsewhere")
    learner = _learner(db_session, "learner", org)
    _serve(db_session, elsewhere)
    _enrol(db_session, learner, elsewhere)

    assert (
        bank_status_on_show(
            db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
        )
        is None
    )


# --- bank_status_open_for_attempts ------------------------------------------


def test_the_row_for_a_bank_open_to_new_attempts_is_given(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _serve(db_session, org, active_version=4)
    _enrol(db_session, learner, org)

    row = bank_status_open_for_attempts(
        db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
    )

    assert row is not None
    assert (row.org_unit_id, row.question_bank_id) == (org.id, BANK)
    assert row.active_version == 4


def test_no_row_is_given_for_a_bank_closed_to_new_attempts(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _serve(db_session, org, is_live=False)
    _enrol(db_session, learner, org)

    assert (
        bank_status_open_for_attempts(
            db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
        )
        is None
    )


def test_an_open_bank_with_no_version_promoted_is_given_for_the_caller_to_ask(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _serve(db_session, org, active_version=None)
    _enrol(db_session, learner, org)

    row = bank_status_open_for_attempts(
        db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
    )

    assert row is not None
    assert row.active_version is None


def test_no_open_row_is_given_for_a_bank_they_are_not_enrolled_on(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _serve(db_session, org)

    assert (
        bank_status_open_for_attempts(
            db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
        )
        is None
    )


def test_no_open_row_is_given_for_another_bank_than_the_one_asked_about(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    _serve(db_session, org)
    _enrol(db_session, learner, org)

    assert (
        bank_status_open_for_attempts(
            db_session,
            learner.id,
            organisation_ids=[org.id],
            bank_id=OTHER_BANK,
        )
        is None
    )


def test_no_open_row_is_given_from_an_organisation_that_was_not_named(
    db_session: Session,
) -> None:
    """Enrolled there, and it is still not one of theirs to ask."""
    org = _organisation(db_session)
    elsewhere = _organisation(db_session, "Elsewhere")
    learner = _learner(db_session, "learner", org)
    _serve(db_session, elsewhere)
    _enrol(db_session, learner, elsewhere)

    assert (
        bank_status_open_for_attempts(
            db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
        )
        is None
    )


# --- attempt_belonging_to ---------------------------------------------------


def _attempt(db: Session, user: User, org: OrgUnit) -> Assessment:
    assessment = Assessment(
        user_id=user.id,
        org_unit_id=org.id,
        question_bank_id=BANK,
        bank_version=1,
        time_limit_minutes=30,
        total_items=0,
    )
    db.add(assessment)
    db.flush()

    return assessment


def test_an_attempt_is_given_to_the_person_whose_it_is(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    assessment = _attempt(db_session, learner, org)

    assert (
        attempt_belonging_to(db_session, learner.id, assessment.id)
        is assessment
    )


def test_an_attempt_is_not_given_to_anybody_else(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)
    other = _learner(db_session, "other", org)
    assessment = _attempt(db_session, other, org)

    assert attempt_belonging_to(db_session, learner.id, assessment.id) is None


def test_an_attempt_that_does_not_exist_is_given_to_nobody(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _learner(db_session, "learner", org)

    assert attempt_belonging_to(db_session, learner.id, 4242) is None


def test_their_own_attempt_is_given_finished_or_with_no_place_left(
    db_session: Session,
) -> None:
    """Ownership is the whole of it: neither is this function's question."""
    org = _organisation(db_session)
    learner = _person(db_session, "learner")
    assessment = _attempt(db_session, learner, org)
    assessment.completed_at = datetime.now(UTC)
    db_session.flush()

    assert (
        attempt_belonging_to(db_session, learner.id, assessment.id)
        is assessment
    )


# --- newest_copies_held_by and newest_copy_held_by --------------------------


def test_an_organisation_with_nothing_synced_holds_no_copies(
    db_session: Session,
) -> None:
    org = _organisation(db_session)

    assert newest_copies_held_by(db_session, org.id) == {}
    assert newest_copy_held_by(db_session, org.id, BANK) is None


def test_the_newest_copy_of_each_bank_is_given_in_bank_id_order(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _sync(db_session, org, BANK, "Polyps, first", version=1)
    _sync(db_session, org, BANK, "Polyps, third", version=3)
    _sync(db_session, org, BANK, "Polyps, second", version=2)
    _sync(db_session, org, OTHER_BANK, "Bleeding", version=1)

    held = newest_copies_held_by(db_session, org.id)

    assert list(held) == [OTHER_BANK, BANK]
    assert (held[BANK].version, held[BANK].title) == (3, "Polyps, third")
    assert held[OTHER_BANK].version == 1


def test_a_copy_is_held_whether_or_not_anything_is_served_of_it(
    db_session: Session,
) -> None:
    """Nothing is asked of promotion: an administrator sees what is synced."""
    org = _organisation(db_session)
    _sync(db_session, org, BANK, "Polyps")
    _sync(db_session, org, OTHER_BANK, "Bleeding")
    _serve(db_session, org, OTHER_BANK, active_version=None, is_live=False)

    assert set(newest_copies_held_by(db_session, org.id)) == {BANK, OTHER_BANK}


def test_a_copy_another_organisation_holds_is_not_among_the_copies(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    other = _organisation(db_session, "Another Trust")
    _sync(db_session, org, BANK, "Polyps", version=1)
    _sync(db_session, other, BANK, "Their polyps", version=9)
    _sync(db_session, other, OTHER_BANK, "Their bleeding")

    held = newest_copies_held_by(db_session, org.id)

    assert list(held) == [BANK]
    assert (held[BANK].version, held[BANK].title) == (1, "Polyps")


def test_the_newest_copy_of_one_bank_is_given(db_session: Session) -> None:
    org = _organisation(db_session)
    _sync(db_session, org, BANK, "Polyps, first", version=1)
    _sync(db_session, org, BANK, "Polyps, second", version=2)
    _sync(db_session, org, OTHER_BANK, "Bleeding", version=7)

    copy_held = newest_copy_held_by(db_session, org.id, BANK)

    assert copy_held is not None
    assert (copy_held.version, copy_held.title) == (2, "Polyps, second")


def test_a_bank_only_another_organisation_holds_gives_no_copy(
    db_session: Session,
) -> None:
    """The same answer as a bank nobody holds, so an id is not confirmed."""
    org = _organisation(db_session)
    other = _organisation(db_session, "Another Trust")
    _sync(db_session, other, BANK, "Their polyps")

    assert newest_copy_held_by(db_session, org.id, BANK) is None
    assert newest_copy_held_by(db_session, org.id, "no-such-bank") is None


# --- organisations_with_teaching_on -----------------------------------------


def _switch_on(db: Session, unit: OrgUnit, feature: str = "teaching") -> None:
    db.add(
        OrgUnitFeature(org_unit_id=unit.id, feature_key=feature, enabled_by=1)
    )
    db.flush()


def test_with_teaching_on_nowhere_no_organisation_is_given(
    db_session: Session,
) -> None:
    _organisation(db_session)

    assert organisations_with_teaching_on(db_session) == []


def test_every_organisation_with_teaching_on_is_given_in_name_order(
    db_session: Session,
) -> None:
    """Nobody is passed in, so it is not narrowed to anybody: every
    organisation that teaches is given, whoever is asking.
    """
    second = _organisation(db_session, "Second Trust")
    first = _organisation(db_session, "First Trust")
    _organisation(db_session, "Trust that does not teach")
    _switch_on(db_session, second)
    _switch_on(db_session, first)

    given = organisations_with_teaching_on(db_session)

    assert [org.name for org in given] == ["First Trust", "Second Trust"]


def test_a_ward_with_teaching_on_is_not_an_organisation(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _switch_on(db_session, org)
    _switch_on(db_session, _ward(db_session, org))
    _switch_on(db_session, _detached_ward(db_session))

    given = organisations_with_teaching_on(db_session)

    assert [unit.id for unit in given] == [org.id]


def test_an_organisation_with_another_feature_on_is_not_given(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    _switch_on(db_session, org, "passport")

    assert organisations_with_teaching_on(db_session) == []
