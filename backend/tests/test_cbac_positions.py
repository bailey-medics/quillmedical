"""Tests for filling, vacating and querying positions.

The acceptance criteria in ``test_org_scoped_access_criteria.py`` say what a
position has to express. These test the service itself: that appointment is
checked against the person's competency *at that place*, that cardinality is
a fact about the post, that acting cover behaves differently from a
substantive appointment, and that history survives someone leaving.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.cbac.positions import (
    appoint,
    holders_of,
    holdings_on,
    is_vacant,
    vacate,
)
from app.models import (
    Organisation,
    Position,
    PractisingCompetency,
    Site,
    User,
)
from app.security import hash_password

LEAD_COMPETENCY = "access_patient_records"


def _user(db: Session, username: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
        system_permissions="staff",
    )
    db.add(user)
    db.commit()
    return user


def _org(db: Session, name: str = "Trust") -> Organisation:
    org = Organisation(name=name, type="hospital")
    db.add(org)
    db.commit()
    return org


def _site(db: Session, name: str = "Ward 1") -> Site:
    site = Site(name=name, type="ward")
    db.add(site)
    db.commit()
    return site


def _authorise(
    db: Session,
    user: User,
    competency: str = LEAD_COMPETENCY,
    *,
    org: Organisation | None = None,
    site: Site | None = None,
) -> None:
    db.add(
        PractisingCompetency(
            user_id=user.id,
            organisation_id=org.id if org else None,
            site_id=site.id if site else None,
            competency=competency,
        )
    )
    db.commit()


def _post(
    db: Session,
    *,
    org: Organisation | None = None,
    site: Site | None = None,
    requires: str | None = LEAD_COMPETENCY,
    max_holders: int | None = 1,
    kind: str = "clinical_lead",
) -> Position:
    post = Position(
        organisation_id=org.id if org else None,
        site_id=site.id if site else None,
        kind=kind,
        title="Clinical lead",
        requires_competency=requires,
        max_holders=max_holders,
    )
    db.add(post)
    db.commit()
    return post


class TestAppointmentChecksTheCompetencyHere:
    """Holding a competency somewhere is not holding it where the post is."""

    def test_someone_authorised_here_can_be_appointed(self, db_session):
        site = _site(db_session)
        post = _post(db_session, site=site)
        doctor = _user(db_session, "dr_here")
        _authorise(db_session, doctor, site=site)

        appoint(db_session, post, doctor)
        db_session.commit()

        assert holders_of(db_session, post) == [doctor.id]

    def test_someone_authorised_elsewhere_cannot(self, db_session):
        """The case the whole scoping model exists for."""
        here = _site(db_session, "Ward 1")
        there = _site(db_session, "Ward 2")
        post = _post(db_session, site=here)
        doctor = _user(db_session, "dr_elsewhere")
        _authorise(db_session, doctor, site=there)

        with pytest.raises(ValueError, match="not authorised"):
            appoint(db_session, post, doctor)

    def test_someone_with_no_authorisation_cannot(self, db_session):
        site = _site(db_session)
        post = _post(db_session, site=site)
        doctor = _user(db_session, "dr_unauthorised")

        with pytest.raises(ValueError, match="not authorised"):
            appoint(db_session, post, doctor)

    def test_a_post_requiring_nothing_takes_anyone(self, db_session):
        """Not every post needs a competency behind it."""
        site = _site(db_session)
        post = _post(db_session, site=site, requires=None)
        administrator = _user(db_session, "admin_person")

        appoint(db_session, post, administrator)
        db_session.commit()

        assert holders_of(db_session, post) == [administrator.id]


class TestHowManyMayHoldIt:
    """Cardinality is a fact about the post, not about the competency."""

    def test_a_second_substantive_holder_is_refused(self, db_session):
        site = _site(db_session)
        post = _post(db_session, site=site, max_holders=1)
        first = _user(db_session, "dr_first")
        second = _user(db_session, "dr_second")
        for person in (first, second):
            _authorise(db_session, person, site=site)

        appoint(db_session, post, first)
        db_session.commit()

        with pytest.raises(ValueError, match="already has"):
            appoint(db_session, post, second)

    def test_a_post_with_no_limit_takes_several(self, db_session):
        """A fire warden post is not singular."""
        site = _site(db_session)
        post = _post(db_session, site=site, max_holders=None)
        people = [_user(db_session, f"warden_{i}") for i in range(3)]
        for person in people:
            _authorise(db_session, person, site=site)
            appoint(db_session, post, person)
        db_session.commit()

        assert sorted(holders_of(db_session, post)) == sorted(
            p.id for p in people
        )

    def test_vacating_frees_the_slot(self, db_session):
        """A handover: one ends on the 30th, the next starts on the 1st.

        Both dates are inclusive, so someone leaving on the 30th still held
        the post that day. Appointing a successor to start the same day
        would be two holders, and is refused.
        """
        site = _site(db_session)
        post = _post(db_session, site=site, max_holders=1)
        leaver = _user(db_session, "dr_leaver")
        joiner = _user(db_session, "dr_joiner")
        for person in (leaver, joiner):
            _authorise(db_session, person, site=site)

        held = appoint(db_session, post, leaver, started_on=date(2026, 1, 1))
        db_session.commit()
        vacate(db_session, held, ended_on=date(2026, 6, 30))
        db_session.commit()

        appoint(db_session, post, joiner, started_on=date(2026, 7, 1))
        db_session.commit()

        assert holders_of(db_session, post, date(2026, 6, 30)) == [leaver.id]
        assert holders_of(db_session, post, date(2026, 7, 1)) == [joiner.id]

    def test_a_successor_cannot_start_on_the_leaver_s_last_day(
        self, db_session
    ):
        """Two holders on one day is two holders."""
        site = _site(db_session)
        post = _post(db_session, site=site, max_holders=1)
        leaver = _user(db_session, "dr_leaver")
        joiner = _user(db_session, "dr_joiner")
        for person in (leaver, joiner):
            _authorise(db_session, person, site=site)

        held = appoint(db_session, post, leaver, started_on=date(2026, 1, 1))
        db_session.commit()
        vacate(db_session, held, ended_on=date(2026, 6, 30))
        db_session.commit()

        with pytest.raises(ValueError, match="already has"):
            appoint(db_session, post, joiner, started_on=date(2026, 6, 30))

    def test_a_non_positive_limit_is_refused_by_the_database(self, db_session):
        site = _site(db_session)
        db_session.add(
            Position(
                site_id=site.id,
                kind="clinical_lead",
                title="Clinical lead",
                max_holders=0,
            )
        )
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()


class TestActingCover:
    """Covering leave is not the same as holding the post."""

    def test_cover_is_not_blocked_by_the_limit(self, db_session):
        """Otherwise nobody could ever cover a singular post."""
        site = _site(db_session)
        post = _post(db_session, site=site, max_holders=1)
        substantive = _user(db_session, "dr_substantive")
        cover = _user(db_session, "dr_cover")
        for person in (substantive, cover):
            _authorise(db_session, person, site=site)

        appoint(db_session, post, substantive)
        appoint(db_session, post, cover, is_acting=True)
        db_session.commit()

        assert len(holders_of(db_session, post)) == 2

    def test_cover_still_needs_the_competency(self, db_session):
        site = _site(db_session)
        post = _post(db_session, site=site)
        cover = _user(db_session, "dr_cover")

        with pytest.raises(ValueError, match="not authorised"):
            appoint(db_session, post, cover, is_acting=True)


class TestThePostOutlivesItsHolders:
    """History is the reason holding is a table rather than a column."""

    def test_a_past_holder_is_found_on_the_date_they_held_it(self, db_session):
        """'Who was the lead in March?' — the question a review asks."""
        site = _site(db_session)
        post = _post(db_session, site=site)
        doctor = _user(db_session, "dr_past")
        _authorise(db_session, doctor, site=site)

        march = date(2026, 3, 1)
        held = appoint(db_session, post, doctor, started_on=march)
        db_session.commit()
        vacate(db_session, held, ended_on=date(2026, 6, 30))
        db_session.commit()

        assert holders_of(db_session, post, date(2026, 3, 15)) == [doctor.id]
        assert holders_of(db_session, post, date(2026, 8, 1)) == []
        assert is_vacant(db_session, post, date(2026, 8, 1))

    def test_a_holding_is_not_in_force_before_it_started(self, db_session):
        site = _site(db_session)
        post = _post(db_session, site=site)
        doctor = _user(db_session, "dr_future")
        _authorise(db_session, doctor, site=site)

        appoint(db_session, post, doctor, started_on=date(2026, 6, 1))
        db_session.commit()

        assert holdings_on(db_session, post, date(2026, 5, 31)) == []
        assert len(holdings_on(db_session, post, date(2026, 6, 1))) == 1

    def test_the_row_survives_being_vacated(self, db_session):
        """Ending a holding must not delete the record of it."""
        site = _site(db_session)
        post = _post(db_session, site=site)
        doctor = _user(db_session, "dr_gone")
        _authorise(db_session, doctor, site=site)

        held = appoint(db_session, post, doctor)
        db_session.commit()
        vacate(db_session, held, ended_on=date.today() + timedelta(days=1))
        db_session.commit()

        assert db_session.get(type(held), held.id) is not None

    def test_a_holding_cannot_end_before_it_started(self, db_session):
        site = _site(db_session)
        post = _post(db_session, site=site)
        doctor = _user(db_session, "dr_muddled")
        _authorise(db_session, doctor, site=site)

        held = appoint(db_session, post, doctor, started_on=date(2026, 6, 1))
        db_session.commit()

        with pytest.raises(ValueError, match="before it started"):
            vacate(db_session, held, ended_on=date(2026, 5, 1))

    def test_a_holding_cannot_be_ended_twice(self, db_session):
        site = _site(db_session)
        post = _post(db_session, site=site)
        doctor = _user(db_session, "dr_twice")
        _authorise(db_session, doctor, site=site)

        held = appoint(db_session, post, doctor)
        db_session.commit()
        vacate(db_session, held)
        db_session.commit()

        with pytest.raises(ValueError, match="already ended"):
            vacate(db_session, held)


class TestThePostBelongsToOnePlace:
    """The same constraint as a practising competency, for the same reason."""

    def test_naming_both_places_is_refused(self, db_session):
        org = _org(db_session)
        site = _site(db_session)
        db_session.add(
            Position(
                organisation_id=org.id,
                site_id=site.id,
                kind="clinical_lead",
                title="Clinical lead",
            )
        )
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

    def test_naming_no_place_is_refused(self, db_session):
        db_session.add(Position(kind="clinical_lead", title="Clinical lead"))
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

    def test_one_post_of_a_kind_per_place(self, db_session):
        site = _site(db_session)
        _post(db_session, site=site)
        db_session.add(
            Position(
                site_id=site.id,
                kind="clinical_lead",
                title="Another clinical lead",
            )
        )
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

    def test_an_unknown_kind_is_refused(self, db_session):
        site = _site(db_session)
        with pytest.raises(ValueError, match="Unknown position kind"):
            Position(
                site_id=site.id,
                kind="chief_wizard",
                title="Chief wizard",
            )

    def test_an_unknown_required_competency_is_refused(self, db_session):
        site = _site(db_session)
        with pytest.raises(ValueError, match="Unknown competency"):
            Position(
                site_id=site.id,
                kind="clinical_lead",
                title="Clinical lead",
                requires_competency="prescribe_moonbeams",
            )


class TestOrganisationLevelPosts:
    """A post can belong to an organisation as well as a site."""

    def test_an_organisation_post_checks_the_organisation(self, db_session):
        org = _org(db_session)
        post = _post(db_session, org=org, kind="caldicott_guardian")
        guardian = _user(db_session, "dr_guardian")
        _authorise(db_session, guardian, org=org)

        appoint(db_session, post, guardian)
        db_session.commit()

        assert holders_of(db_session, post) == [guardian.id]

    def test_a_site_authorisation_does_not_fill_an_organisation_post(
        self, db_session
    ):
        """Nothing is inherited, in either direction."""
        org = _org(db_session)
        site = _site(db_session)
        post = _post(db_session, org=org, kind="caldicott_guardian")
        person = _user(db_session, "dr_site_only")
        _authorise(db_session, person, site=site)

        with pytest.raises(ValueError, match="not authorised"):
            appoint(db_session, post, person)
