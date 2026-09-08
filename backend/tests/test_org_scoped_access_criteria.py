"""Executable specification for organisation-scoped access control.

The twelve cases in ``docs/docs/plans/2026-09-06-org-scoped-access-findings.md``
under "The cases any schema must express", written as tests so a candidate
design either satisfies them or does not. None of them passes today: a
competency is one global set on the user, and ``has_competency`` has no
parameter for a place to ask about.

**These are marked ``xfail(strict=True)`` on purpose.** They run on every
suite, they keep CI green while the design is unbuilt, and the moment one
starts passing pytest reports it as unexpectedly passing and fails the build — which is the signal
wanted. A test here going green is news.

**Two piles, deliberately.** Where a case can be set up with today's tables it
is an xfail. Where it cannot be expressed at all it is a ``skip`` naming what
is missing, and that shorter list is the queue of open questions worth
settling next.

To adopt: point ``_can_at`` at the real per-place resolver when one exists.
Every xfail here should start passing in the same commit.

Every competency named below exists in ``shared/competencies.yaml``. Some are
stand-ins — there is no rota or clinical-safety-officer competency yet, so a
real one of roughly the right shape stands in its place. What is asserted is
that the answer differs by place, not which competency it is.
"""

from __future__ import annotations

import pytest
from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.cbac.positions import appoint, holders_of, is_vacant
from app.cbac.scoped import can_practise_at
from app.models import (
    Organisation,
    Position,
    PractisingCompetency,
    Site,
    User,
    organisation_site,
    organisation_staff_member,
    site_staff_member,
)
from app.security import hash_password


def _can_at_org(db: Session, user: User, org_id: int, competency: str) -> bool:
    """Whether ``user`` may exercise ``competency`` at an organisation."""
    return can_practise_at(db, user, competency, organisation_id=org_id)


def _can_at_site(
    db: Session, user: User, site_id: int, competency: str
) -> bool:
    """Whether ``user`` may exercise ``competency`` at a site."""
    return can_practise_at(db, user, competency, site_id=site_id)


def _authorise(
    db: Session,
    user: User,
    competency: str,
    *,
    org: Organisation | None = None,
    site: Site | None = None,
) -> None:
    """Enable one competency for one person at one place."""
    db.add(
        PractisingCompetency(
            user_id=user.id,
            organisation_id=org.id if org else None,
            site_id=site.id if site else None,
            competency=competency,
        )
    )
    db.commit()


def _user(
    db: Session,
    username: str,
    *,
    profession: str = "consultant",
    fhir_patient_id: str | None = None,
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        system_permissions="staff",
        fhir_patient_id=fhir_patient_id,
    )
    db.add(user)
    db.commit()
    return user


def _org(db: Session, name: str) -> Organisation:
    org = Organisation(name=name, type="hospital")
    db.add(org)
    db.commit()
    return org


def _site(db: Session, name: str, org: Organisation) -> Site:
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


def _staff(db: Session, user: User, org: Organisation) -> None:
    db.execute(
        insert(organisation_staff_member).values(
            organisation_id=org.id, user_id=user.id
        )
    )
    db.commit()


class TestTwoPlacesOnePerson:
    """A person is not one thing everywhere."""

    def test_doctor_at_a_cannot_act_clinically_at_b(self, db_session):
        """The headline case, and the reason this work exists."""
        trust_a = _org(db_session, "Trust A")
        trust_b = _org(db_session, "Trust B")
        doctor = _user(db_session, "dr_two_trusts")
        _staff(db_session, doctor, trust_a)
        _authorise(db_session, doctor, "access_patient_records", org=trust_a)

        assert _can_at_org(
            db_session, doctor, trust_a.id, "access_patient_records"
        )
        assert not _can_at_org(
            db_session, doctor, trust_b.id, "access_patient_records"
        )

    def test_a_locum_is_narrower_than_their_ceiling(self, db_session):
        """Holding a competency is not the same as being allowed to use it."""
        home = _org(db_session, "Home Trust")
        locum_at = _org(db_session, "Locum Trust")
        locum = _user(db_session, "dr_locum")
        _staff(db_session, locum, home)
        _staff(db_session, locum, locum_at)
        # Enabled at home, deliberately not at the locum trust, though the
        # ceiling is identical in both places.
        _authorise(
            db_session, locum, "prescribe_controlled_schedule_2", org=home
        )

        assert _can_at_org(
            db_session, locum, home.id, "prescribe_controlled_schedule_2"
        )
        assert not _can_at_org(
            db_session, locum, locum_at.id, "prescribe_controlled_schedule_2"
        )

    def test_a_student_at_one_teaching_site_and_nothing_at_another(
        self, db_session
    ):
        teaching = _org(db_session, "Teaching Trust")
        elsewhere = _org(db_session, "Other Trust")
        student = _user(db_session, "student", profession="teaching_delegate")
        _staff(db_session, student, teaching)
        _authorise(db_session, student, "view_teaching_cases", org=teaching)

        assert _can_at_org(
            db_session, student, teaching.id, "view_teaching_cases"
        )
        assert not _can_at_org(
            db_session, student, elsewhere.id, "view_teaching_cases"
        )


class TestOneSiteWithinAnOrganisation:
    """A place is a site as often as it is an organisation."""

    def test_a_site_administrator_holds_no_organisation_authority(
        self, db_session
    ):
        """Administering a ward must not require administering the trust.

        The case that rules out inheritance: if a site's grants were derived
        from its organisation's, this could not be expressed at all.
        """
        trust = _org(db_session, "Trust")
        ward = _site(db_session, "Ward 9", trust)
        manager = _user(
            db_session, "ward_manager", profession="clinic_manager"
        )
        _staff(db_session, manager, trust)
        db_session.execute(
            insert(site_staff_member).values(
                site_id=ward.id, user_id=manager.id, role="staff"
            )
        )
        db_session.commit()
        _authorise(db_session, manager, "manage_users", site=ward)

        assert _can_at_site(db_session, manager, ward.id, "manage_users")
        assert not _can_at_org(db_session, manager, trust.id, "manage_users")

    def test_an_educator_delivers_where_they_hold_no_admin_job(
        self, db_session
    ):
        """Delivering teaching is a competency, not an administrative post."""
        trust = _org(db_session, "Trust")
        site = _site(db_session, "Education Centre", trust)
        educator = _user(db_session, "educator", profession="teaching_admin")
        _staff(db_session, educator, trust)

        # Enabled to teach here. Reading the analytics is inside this
        # person's ceiling but not switched on at this site, which is the
        # distinction the whole model turns on.
        _authorise(db_session, educator, "view_teaching_cases", site=site)

        assert _can_at_site(
            db_session, educator, site.id, "view_teaching_cases"
        )
        assert not _can_at_site(
            db_session, educator, site.id, "view_teaching_analytics"
        )

    def test_a_rota_manager_holds_no_clinical_competency(self, db_session):
        """An administrative job carries nothing clinical with it."""
        trust = _org(db_session, "Trust")
        manager = _user(db_session, "rota_manager", profession="receptionist")
        _staff(db_session, manager, trust)

        _authorise(db_session, manager, "access_clinic_admin", org=trust)
        # Granted, but outside the ceiling: a clinic manager is not qualified
        # for it, so the grant has no effect. The intersection does the work,
        # not the grant alone.
        _authorise(db_session, manager, "access_patient_records", org=trust)

        assert _can_at_org(
            db_session, manager, trust.id, "access_clinic_admin"
        )
        assert not _can_at_org(
            db_session, manager, trust.id, "access_patient_records"
        )

    def test_a_clinical_safety_officer_for_one_project_only(self, db_session):
        """Statutory posts are held at a place, not held outright."""
        trust = _org(db_session, "Trust")
        project = _site(db_session, "Project Alpha", trust)
        officer = _user(
            db_session, "safety_officer", profession="teaching_admin"
        )
        _staff(db_session, officer, trust)

        _authorise(
            db_session, officer, "view_teaching_analytics", site=project
        )

        assert _can_at_site(
            db_session, officer, project.id, "view_teaching_analytics"
        )
        assert not _can_at_org(
            db_session, officer, trust.id, "view_teaching_analytics"
        )


class TestPositionsAsOpposedToCompetencies:
    """A position can be vacant. A competency cannot."""

    def _lead_post(self, db_session, site: Site) -> Position:
        post = Position(
            site_id=site.id,
            kind="clinical_lead",
            title="Clinical lead",
            requires_competency="access_patient_records",
            max_holders=1,
        )
        db_session.add(post)
        db_session.commit()
        return post

    def test_a_site_can_have_a_vacant_clinical_lead_post(self, db_session):
        """'This site has no clinical lead' must be a state, not an absence."""
        trust = _org(db_session, "Trust")
        ward = _site(db_session, "Ward 4", trust)
        post = self._lead_post(db_session, ward)

        # The post exists and nobody holds it. That is the point: an absent
        # row could not be told apart from a site that never needed a lead.
        assert is_vacant(db_session, post)
        assert holders_of(db_session, post) == []

        doctor = _user(db_session, "dr_lead")
        _staff(db_session, doctor, trust)
        _authorise(db_session, doctor, "access_patient_records", site=ward)
        appoint(db_session, post, doctor)
        db_session.commit()

        assert not is_vacant(db_session, post)
        assert holders_of(db_session, post) == [doctor.id]

    def test_an_acting_clinical_lead_covers_leave(self, db_session):
        """Filling a slot temporarily is a property of the slot."""
        trust = _org(db_session, "Trust")
        ward = _site(db_session, "Ward 4", trust)
        post = self._lead_post(db_session, ward)

        substantive = _user(db_session, "dr_substantive")
        cover = _user(db_session, "dr_cover")
        for person in (substantive, cover):
            _staff(db_session, person, trust)
            _authorise(db_session, person, "access_patient_records", site=ward)

        appoint(db_session, post, substantive)
        db_session.commit()

        # Cover sits alongside the substantive holder rather than replacing
        # them, so the record still shows whose post it is — and it is not
        # blocked by max_holders, or nobody could ever cover.
        appoint(db_session, post, cover, is_acting=True)
        db_session.commit()

        assert sorted(holders_of(db_session, post)) == sorted(
            [substantive.id, cover.id]
        )
        assert not is_vacant(db_session, post)

    def test_a_post_held_only_by_cover_is_still_vacant(self, db_session):
        """Covering leave is not holding the post.

        A site whose lead has left and is being covered is exactly the state
        worth chasing, so acting cover must not hide it.
        """
        trust = _org(db_session, "Trust")
        ward = _site(db_session, "Ward 4", trust)
        post = self._lead_post(db_session, ward)

        cover = _user(db_session, "dr_cover")
        _staff(db_session, cover, trust)
        _authorise(db_session, cover, "access_patient_records", site=ward)
        appoint(db_session, post, cover, is_acting=True)
        db_session.commit()

        assert is_vacant(db_session, post)
        assert holders_of(db_session, post) == [cover.id]


class TestPatientAndStaffAreTheSamePerson:
    """The namespaces have to meet before these can even be written."""

    @pytest.mark.skip(
        reason=(
            "staff membership keys on user_id, patient membership on a FHIR "
            "patient_id; bridged only by the nullable User.fhir_patient_id, "
            "so the two cannot be written as two similar rows"
        )
    )
    def test_a_nurse_treated_at_her_own_hospital_reads_only_her_own_record(
        self, db_session
    ):
        """No mode switch: the competency differs, not the identity."""

    @pytest.mark.skip(
        reason=(
            "self-scoped competencies are not modelled; "
            "access_patient_records carries the distinction in a comment"
        )
    )
    def test_a_patient_administers_their_own_chemotherapy_at_home(
        self, db_session
    ):
        """A competency can sit with a patient, so 'clinical' is not staff-only."""


class TestCeilingsThatLapse:
    """What a person may do rests on something that can expire."""

    @pytest.mark.skip(
        reason=(
            "nothing records how a competency was acquired; "
            "User.professional_registrations is JSON that nothing reads"
        )
    )
    def test_a_lapsed_registration_drops_clinical_grants_not_memberships(
        self, db_session
    ):
        """Losing registration ends the clinical grants, not the employment."""
