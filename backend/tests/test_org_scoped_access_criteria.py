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

Every capability named below exists in ``shared/competencies.yaml``. Some are
stand-ins — there is no ``manage_rota`` or clinical-safety-officer capability
yet, so a real one of roughly the right shape stands in its place. What is
being asserted is that the answer differs by place, not which capability it
is.
"""

from __future__ import annotations

import pytest
from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.models import (
    Organisation,
    Site,
    User,
    organisation_site,
    organisation_staff_member,
    site_staff_member,
)
from app.security import hash_password


def _can_at(user: User, place_id: int, capability: str) -> bool:
    """Whether ``user`` may exercise ``capability`` at ``place_id``.

    The question the whole design exists to answer, and the one thing today's
    code cannot express: ``get_final_competencies`` takes no arguments beyond
    the user, so the place is discarded and the same answer comes back
    everywhere. That is why every test below fails.

    When a per-place resolver exists, this body is the only thing that
    changes.
    """
    del place_id  # the point: nothing today can use it
    return capability in user.get_final_competencies()


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

    @pytest.mark.xfail(
        strict=True,
        reason="competencies are global; the place is discarded",
    )
    def test_doctor_at_a_cannot_act_clinically_at_b(self, db_session):
        """The headline case, and the reason this work exists."""
        trust_a = _org(db_session, "Trust A")
        trust_b = _org(db_session, "Trust B")
        doctor = _user(db_session, "dr_two_trusts")
        _staff(db_session, doctor, trust_a)

        assert _can_at(doctor, trust_a.id, "access_patient_records")
        assert not _can_at(doctor, trust_b.id, "access_patient_records")

    @pytest.mark.xfail(
        strict=True,
        reason="competencies are global; the place is discarded",
    )
    def test_a_locum_is_narrower_than_their_ceiling(self, db_session):
        """Holding a capability is not the same as being allowed to use it."""
        home = _org(db_session, "Home Trust")
        locum_at = _org(db_session, "Locum Trust")
        locum = _user(db_session, "dr_locum")
        _staff(db_session, locum, home)
        _staff(db_session, locum, locum_at)

        assert _can_at(locum, home.id, "prescribe_controlled_schedule_2")
        assert not _can_at(
            locum, locum_at.id, "prescribe_controlled_schedule_2"
        )

    @pytest.mark.xfail(
        strict=True,
        reason="competencies are global; the place is discarded",
    )
    def test_a_student_at_one_teaching_site_and_nothing_at_another(
        self, db_session
    ):
        teaching = _org(db_session, "Teaching Trust")
        elsewhere = _org(db_session, "Other Trust")
        student = _user(db_session, "student", profession="teaching_delegate")
        _staff(db_session, student, teaching)

        assert _can_at(student, teaching.id, "view_teaching_cases")
        assert not _can_at(student, elsewhere.id, "view_teaching_cases")


class TestOneSiteWithinAnOrganisation:
    """A place is a site as often as it is an organisation."""

    @pytest.mark.xfail(
        strict=True,
        reason="no site-level administration; system_permissions is global",
    )
    def test_a_site_administrator_holds_no_organisation_authority(
        self, db_session
    ):
        """Administering a ward must not require administering the trust."""
        trust = _org(db_session, "Trust")
        ward = _site(db_session, "Ward 9", trust)
        manager = _user(db_session, "ward_manager")
        _staff(db_session, manager, trust)
        db_session.execute(
            insert(site_staff_member).values(
                site_id=ward.id, user_id=manager.id, role="staff"
            )
        )
        db_session.commit()

        assert _can_at(manager, ward.id, "manage_users")
        assert not _can_at(manager, trust.id, "manage_users")

    @pytest.mark.xfail(
        strict=True,
        reason="competencies are global; the place is discarded",
    )
    def test_an_educator_delivers_where_they_hold_no_admin_job(
        self, db_session
    ):
        """Delivering teaching is a capability, not an administrative post."""
        trust = _org(db_session, "Trust")
        site = _site(db_session, "Education Centre", trust)
        educator = _user(db_session, "educator", profession="teaching_admin")
        _staff(db_session, educator, trust)

        assert _can_at(educator, site.id, "view_teaching_cases")
        assert not _can_at(educator, site.id, "manage_teaching_content")

    @pytest.mark.xfail(
        strict=True,
        reason="competencies are global; the place is discarded",
    )
    def test_a_rota_manager_holds_no_clinical_capability(self, db_session):
        """An administrative job carries nothing clinical with it."""
        trust = _org(db_session, "Trust")
        manager = _user(
            db_session, "rota_manager", profession="clinic_manager"
        )
        _staff(db_session, manager, trust)

        assert _can_at(manager, trust.id, "access_clinic_admin")
        assert not _can_at(manager, trust.id, "access_patient_records")

    @pytest.mark.xfail(
        strict=True,
        reason="competencies are global; the place is discarded",
    )
    def test_a_clinical_safety_officer_for_one_project_only(self, db_session):
        """Statutory posts are held at a place, not held outright."""
        trust = _org(db_session, "Trust")
        project = _site(db_session, "Project Alpha", trust)
        officer = _user(db_session, "safety_officer")
        _staff(db_session, officer, trust)

        assert _can_at(officer, project.id, "view_teaching_analytics")
        assert not _can_at(officer, trust.id, "view_teaching_analytics")


class TestPositionsAsOpposedToCapabilities:
    """A position can be vacant. A capability cannot."""

    @pytest.mark.skip(
        reason=(
            "no position model: site_staff_member.role is the nearest thing "
            "and cannot express a vacancy, only an absent row"
        )
    )
    def test_a_site_can_have_a_vacant_clinical_lead_post(self, db_session):
        """'This site has no clinical lead' must be a state, not an absence."""

    @pytest.mark.skip(
        reason="no position model, so no acting cover and no holder history"
    )
    def test_an_acting_clinical_lead_covers_leave(self, db_session):
        """Filling a slot temporarily is a property of the slot."""


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
        """No mode switch: the capability differs, not the identity."""

    @pytest.mark.skip(
        reason=(
            "self-scoped capabilities are not modelled; "
            "access_patient_records carries the distinction in a comment"
        )
    )
    def test_a_patient_administers_their_own_chemotherapy_at_home(
        self, db_session
    ):
        """A capability can sit with a patient, so 'clinical' is not staff-only."""


class TestCeilingsThatLapse:
    """What a person may do rests on something that can expire."""

    @pytest.mark.skip(
        reason=(
            "nothing records how a capability was acquired; "
            "User.professional_registrations is JSON that nothing reads"
        )
    )
    def test_a_lapsed_registration_drops_clinical_grants_not_memberships(
        self, db_session
    ):
        """Losing registration ends the clinical grants, not the employment."""
