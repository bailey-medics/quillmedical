"""Reaching a patient needs the competency *and* the shared organisation.

``check_user_patient_access`` used to open with a rank hatch::

    if user.system_permissions in ("admin", "superadmin"):
        return True

so anyone whose rank said ``admin`` reached **any** patient, whether or
not they shared an organisation with them. The plan recorded this as a
no-op on the two ``messaging.py`` callers because both are "non-admin
paths". That was wrong: neither route carries an admin gate, so the
hatch fired for any admin who reached them, and it was the live grant
rather than dead code.

Both halves are now required — ``access_patient_records`` says *what*,
a shared organisation says *where* — and the tests here fail if either
is dropped:

- Delete the competency check and ``test_competency_without_shared_org``
  passes when it should refuse.
- Delete the membership check and the same test passes for the wrong
  reason, so ``test_shared_org_without_competency`` covers the mirror.

**A superadmin is not a clinician.** ``superadmin_profession`` grants
``manage_users`` alone, so an operator is refused here like anyone else
— pinned by ``test_an_operator_is_not_thereby_a_clinician``, which is
the case the old hatch got backwards.
"""

from __future__ import annotations

import pytest
from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.models import (
    ExternalPatientAccess,
    Organisation,
    User,
    organisation_member,
    organisation_patient_member,
)
from app.organisations import check_user_patient_access
from app.security import hash_password

SHARED_PATIENT = "fhir-patient-shared"
OTHER_PATIENT = "fhir-patient-elsewhere"


def _user(
    db: Session,
    username: str,
    *,
    profession: str,
    platform_role: str = "standard",
) -> User:
    """A user carrying a profession, so their competencies are real.

    Tests that build a user without one take the column default of
    ``patient``, which holds ``access_patient_records`` — the opposite of
    what a test asserting a refusal usually means.
    """
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        platform_role=platform_role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def org_with_patient(db_session: Session) -> Organisation:
    """An organisation holding ``SHARED_PATIENT``."""
    org = Organisation(name="Shared Trust", type="hospital")
    db_session.add(org)
    db_session.commit()
    db_session.execute(
        insert(organisation_patient_member).values(
            organisation_id=org.id, patient_id=SHARED_PATIENT
        )
    )
    db_session.commit()
    db_session.refresh(org)
    return org


def _place(db: Session, org: Organisation, user: User) -> None:
    db.execute(
        insert(organisation_member).values(
            organisation_id=org.id, user_id=user.id, capacity="staff"
        )
    )
    db.commit()


class TestBothHalvesAreRequired:
    """Neither the competency nor the place is sufficient alone."""

    def test_competency_and_shared_org_is_granted(
        self, db_session: Session, org_with_patient: Organisation
    ) -> None:
        """The ordinary case: a clinician at the patient's organisation."""
        clinician = _user(
            db_session, "clinician", profession="specialty_trainee_1_2"
        )
        _place(db_session, org_with_patient, clinician)

        assert (
            check_user_patient_access(db_session, clinician, SHARED_PATIENT)
            is True
        )

    def test_competency_without_shared_org(
        self, db_session: Session, org_with_patient: Organisation
    ) -> None:
        """A clinician elsewhere is refused, competency notwithstanding.

        Fails if the shared-organisation check is dropped.
        """
        clinician = _user(
            db_session, "outsider", profession="specialty_trainee_1_2"
        )
        _place(db_session, org_with_patient, clinician)

        assert (
            check_user_patient_access(db_session, clinician, OTHER_PATIENT)
            is False
        )

    def test_shared_org_without_competency(
        self, db_session: Session, org_with_patient: Organisation
    ) -> None:
        """Sharing an organisation is not itself permission to read.

        A receptionist is staff at the patient's own organisation and
        holds ``access_clinic_admin`` alone — front desk work needs the
        clinic, not the record. Fails if the competency check is dropped.

        ``system_administrator`` looks like the natural fixture here and
        is not: it holds ``access_patient_records`` for technical
        support, so an IT admin at the patient's organisation is
        correctly granted access.
        """
        receptionist = _user(
            db_session, "front_desk", profession="receptionist"
        )
        _place(db_session, org_with_patient, receptionist)

        assert (
            check_user_patient_access(db_session, receptionist, SHARED_PATIENT)
            is False
        )


class TestTheRankHatchIsGone:
    """The cases the old first line got wrong."""

    def test_an_admin_elsewhere_cannot_reach_a_patient(
        self, db_session: Session, org_with_patient: Organisation
    ) -> None:
        """The hole the hatch opened, closed.

        An ``admin`` sharing no organisation with the patient used to be
        granted access by the rank alone.
        """
        admin = _user(
            db_session,
            "far_admin",
            profession="system_administrator",
        )

        assert (
            check_user_patient_access(db_session, admin, SHARED_PATIENT)
            is False
        )

    def test_an_operator_is_not_thereby_a_clinician(
        self, db_session: Session, org_with_patient: Organisation
    ) -> None:
        """Operating Quill confers no access to a record.

        ``superadmin_profession`` grants ``manage_users`` and nothing
        clinical, so even at the patient's own organisation the answer
        is no.
        """
        operator = _user(
            db_session,
            "operator",
            profession="superadmin_profession",
            platform_role="superadmin",
        )
        _place(db_session, org_with_patient, operator)

        assert (
            check_user_patient_access(db_session, operator, SHARED_PATIENT)
            is False
        )


class TestTheOtherTwoRoutesIn:
    """Self-access and external grants are unchanged by this."""

    def test_a_patient_reaches_their_own_record(
        self, db_session: Session
    ) -> None:
        """Checked before anything else, and before any membership."""
        patient = _user(db_session, "the_patient", profession="patient")
        patient.fhir_patient_id = SHARED_PATIENT
        db_session.commit()

        assert (
            check_user_patient_access(db_session, patient, SHARED_PATIENT)
            is True
        )

    def test_an_external_grant_still_works(self, db_session: Session) -> None:
        """An invited person holds no membership and is still let in.

        ``external_hcp`` rather than a clinical profession: the grant is
        paired with ``access_granted_patient_records`` now, so holding a
        caseload competency does not open the invited route. See
        ``test_three_routes_to_a_record.py``.
        """
        external = _user(db_session, "external", profession="external_hcp")
        db_session.add(
            ExternalPatientAccess(
                user_id=external.id,
                patient_id=SHARED_PATIENT,
                granted_by_user_id=external.id,
            )
        )
        db_session.commit()

        assert (
            check_user_patient_access(db_session, external, SHARED_PATIENT)
            is True
        )
