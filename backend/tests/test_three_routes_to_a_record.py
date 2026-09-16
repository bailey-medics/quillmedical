"""Three routes reach a patient record, and each names its own competency.

``access_patient_records`` used to serve two of them. Eighteen staff
professions held it to mean *the patients I treat*; the ``patient``
profession held the same id to mean *my own record*, with a comment —
"Own records only (filtered by system)" — explaining that it did not mean
what it said. Two permissions under one name, which is the fault this
plan exists to remove, one layer below ``system_permissions``.

The third route had no competency at all: an ``ExternalPatientAccess``
grant admitted the holder on its own, so revoking a competency could not
cut that access — only deleting the row could.

Each route now pairs a competency saying *what* with a scope saying
*which*:

- ``access_own_patient_records`` + the account's own patient link
- ``access_granted_patient_records`` + a grant naming this patient
- ``access_patient_records`` + a shared organisation

Every test here fails if its competency is dropped from the gate, and
the cross-checks below fail if one competency is allowed to serve
another's route.
"""

from __future__ import annotations

import pytest
from sqlalchemy import func, insert
from sqlalchemy.orm import Session

from app.models import (
    ExternalPatientAccess,
    Organisation,
    User,
    organisation_patient_member,
)
from app.organisations import (
    add_organisation_member,
    check_user_patient_access,
)
from app.security import hash_password

THEIR_OWN = "fhir-patient-themselves"
A_PATIENT_HERE = "fhir-patient-at-the-trust"
SOMEONE_ELSE = "fhir-patient-unrelated"


def _user(
    db: Session,
    username: str,
    *,
    profession: str,
    fhir_patient_id: str | None = None,
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        fhir_patient_id=fhir_patient_id,
        platform_role="standard",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def org(db_session: Session) -> Organisation:
    """An organisation with one patient on its books."""
    organisation = Organisation(name="Trust", type="hospital")
    db_session.add(organisation)
    db_session.commit()
    db_session.execute(
        insert(organisation_patient_member).values(
            organisation_id=organisation.id, patient_id=A_PATIENT_HERE
        )
    )
    db_session.commit()
    db_session.refresh(organisation)
    return organisation


def _place(db: Session, org: Organisation, user: User) -> None:
    add_organisation_member(db, org.id, user.id, "staff")
    db.commit()


def _grant(db: Session, user: User, patient_id: str) -> ExternalPatientAccess:
    grant = ExternalPatientAccess(
        user_id=user.id,
        patient_id=patient_id,
        granted_by_user_id=user.id,
    )
    db.add(grant)
    db.commit()
    db.refresh(grant)
    return grant


class TestYourOwnRecord:
    """``access_own_patient_records`` plus the account's patient link."""

    def test_a_patient_reaches_their_own_record(
        self, db_session: Session
    ) -> None:
        patient = _user(
            db_session,
            "the_patient",
            profession="patient",
            fhir_patient_id=THEIR_OWN,
        )

        assert (
            check_user_patient_access(db_session, patient, THEIR_OWN) is True
        )

    def test_a_patient_reaches_nobody_else(self, db_session: Session) -> None:
        """The link names one record, so the scope needs no other check."""
        patient = _user(
            db_session,
            "only_their_own",
            profession="patient",
            fhir_patient_id=THEIR_OWN,
        )

        assert (
            check_user_patient_access(db_session, patient, SOMEONE_ELSE)
            is False
        )

    def test_the_competency_without_a_link_reaches_nothing(
        self, db_session: Session
    ) -> None:
        """An account not linked to a record has no own record to read."""
        unlinked = _user(db_session, "no_link", profession="patient")

        assert (
            check_user_patient_access(db_session, unlinked, THEIR_OWN) is False
        )


class TestARecordYouWereInvitedTo:
    """``access_granted_patient_records`` plus a grant."""

    @pytest.mark.parametrize(
        "profession", ["patient_advocate", "external_hcp"]
    )
    def test_an_invited_person_reaches_the_record(
        self, db_session: Session, profession: str
    ) -> None:
        """Fails while the profession is missing from the catalogue.

        Both were accepted by the invite route and defined nowhere, and
        an unknown id resolves to no competencies without complaint.
        """
        invited = _user(db_session, f"a_{profession}", profession=profession)
        _grant(db_session, invited, THEIR_OWN)

        assert (
            check_user_patient_access(db_session, invited, THEIR_OWN) is True
        )

    def test_a_grant_reaches_only_the_patient_it_names(
        self, db_session: Session
    ) -> None:
        advocate = _user(
            db_session, "one_record", profession="patient_advocate"
        )
        _grant(db_session, advocate, THEIR_OWN)

        assert (
            check_user_patient_access(db_session, advocate, SOMEONE_ELSE)
            is False
        )

    def test_a_revoked_grant_is_refused(self, db_session: Session) -> None:
        advocate = _user(
            db_session, "was_revoked", profession="patient_advocate"
        )
        grant = _grant(db_session, advocate, THEIR_OWN)
        grant.revoked_at = func.now()
        db_session.commit()

        assert (
            check_user_patient_access(db_session, advocate, THEIR_OWN) is False
        )

    def test_a_grant_without_the_competency_is_refused(
        self, db_session: Session
    ) -> None:
        """The pairing, asserted: the row alone is no longer enough.

        This is the behaviour change. Before the split, a grant admitted
        anyone holding it regardless of competency.
        """
        receptionist = _user(
            db_session, "front_desk", profession="receptionist"
        )
        _grant(db_session, receptionist, THEIR_OWN)

        assert (
            check_user_patient_access(db_session, receptionist, THEIR_OWN)
            is False
        )


class TestThePatientsYouTreat:
    """``access_patient_records`` plus a shared organisation."""

    def test_a_clinician_reaches_a_patient_at_their_organisation(
        self, db_session: Session, org: Organisation
    ) -> None:
        clinician = _user(
            db_session, "a_clinician", profession="specialty_trainee_1_2"
        )
        _place(db_session, org, clinician)

        assert (
            check_user_patient_access(db_session, clinician, A_PATIENT_HERE)
            is True
        )

    def test_a_clinician_elsewhere_is_refused(
        self, db_session: Session, org: Organisation
    ) -> None:
        clinician = _user(
            db_session, "an_outsider", profession="specialty_trainee_1_2"
        )

        assert (
            check_user_patient_access(db_session, clinician, A_PATIENT_HERE)
            is False
        )

    def test_sharing_an_organisation_without_the_competency_is_refused(
        self, db_session: Session, org: Organisation
    ) -> None:
        """A receptionist is at the organisation and may not read records."""
        receptionist = _user(
            db_session, "the_receptionist", profession="receptionist"
        )
        _place(db_session, org, receptionist)

        assert (
            check_user_patient_access(db_session, receptionist, A_PATIENT_HERE)
            is False
        )


class TestTheRoutesDoNotSubstituteForEachOther:
    """The point of splitting the id: one competency, one route."""

    def test_a_patient_cannot_read_the_ward(
        self, db_session: Session, org: Organisation
    ) -> None:
        """Own-records is not a caseload, even inside an organisation.

        The patient is staff-placed here only to prove that membership
        plus the own-records competency still reaches nothing: before the
        split this pair held the same id a clinician held.
        """
        patient = _user(
            db_session,
            "patient_at_the_trust",
            profession="patient",
            fhir_patient_id=THEIR_OWN,
        )
        _place(db_session, org, patient)

        assert (
            check_user_patient_access(db_session, patient, A_PATIENT_HERE)
            is False
        )

    def test_a_clinician_cannot_use_a_grant(self, db_session: Session) -> None:
        """The clinical competency does not open the invited route."""
        clinician = _user(
            db_session, "granted_clinician", profession="specialty_trainee_1_2"
        )
        _grant(db_session, clinician, SOMEONE_ELSE)

        assert (
            check_user_patient_access(db_session, clinician, SOMEONE_ELSE)
            is False
        )

    def test_an_advocate_cannot_read_a_caseload(
        self, db_session: Session, org: Organisation
    ) -> None:
        """Being invited to one record reaches no others, even shared ones."""
        advocate = _user(
            db_session, "placed_advocate", profession="patient_advocate"
        )
        _place(db_session, org, advocate)
        _grant(db_session, advocate, THEIR_OWN)

        assert (
            check_user_patient_access(db_session, advocate, A_PATIENT_HERE)
            is False
        )


class TestSomeoneWhoIsBoth:
    """Staff who are also patients here — the ordinary case."""

    def test_a_clinician_reaches_their_own_record_and_their_patients(
        self, db_session: Session, org: Organisation
    ) -> None:
        """Both competencies, both routes, no interference between them.

        Nearly a third of employees who look at their own health data use
        both systems to do it — see the plan's citation — so this is the
        common shape rather than an edge case.
        """
        clinician = _user(
            db_session,
            "both_roles",
            profession="specialty_trainee_1_2",
            fhir_patient_id=THEIR_OWN,
        )
        clinician.additional_competencies = ["access_own_patient_records"]
        db_session.commit()
        _place(db_session, org, clinician)

        assert (
            check_user_patient_access(db_session, clinician, THEIR_OWN) is True
        )
        assert (
            check_user_patient_access(db_session, clinician, A_PATIENT_HERE)
            is True
        )
