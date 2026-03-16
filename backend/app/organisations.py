"""Organisation access helpers.

Provides functions for querying organisation membership and access
control. Used throughout the application to enforce org-scoped
visibility boundaries.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    ExternalPatientAccess,
    User,
    organisation_patient_member,
    organisation_staff_member,
)
from app.system_permissions.permissions import is_external_user


def get_user_org_ids(db: Session, user_id: int) -> list[int]:
    """Return organisation IDs the user belongs to as staff."""
    rows = db.execute(
        select(organisation_staff_member.c.organisation_id).where(
            organisation_staff_member.c.user_id == user_id
        )
    ).all()
    return [r[0] for r in rows]


def get_patient_org_ids(db: Session, patient_id: str) -> list[int]:
    """Return organisation IDs the patient belongs to."""
    rows = db.execute(
        select(organisation_patient_member.c.organisation_id).where(
            organisation_patient_member.c.patient_id == patient_id
        )
    ).all()
    return [r[0] for r in rows]


def get_shared_org_ids(
    db: Session, user_id: int, patient_id: str
) -> list[int]:
    """Return organisation IDs shared between a staff user and a patient."""
    user_orgs = set(get_user_org_ids(db, user_id))
    patient_orgs = set(get_patient_org_ids(db, patient_id))
    return sorted(user_orgs & patient_orgs)


def check_user_patient_access(
    db: Session, user: User, patient_id: str
) -> bool:
    """Check whether *user* may access *patient_id*.

    Access is granted if:
    - admin/superadmin (always True for admin pages), OR
    - user shares at least one org with the patient, OR
    - user is an external type with an active ExternalPatientAccess grant.
    """
    if user.system_permissions in ("admin", "superadmin"):
        return True

    # Patient can always access their own records
    if user.fhir_patient_id and user.fhir_patient_id == patient_id:
        return True

    # Org membership check (for staff / patient users)
    shared = get_shared_org_ids(db, user.id, patient_id)
    if shared:
        return True

    # External access grant check
    if is_external_user(user.system_permissions):
        grant = db.scalar(
            select(ExternalPatientAccess).where(
                ExternalPatientAccess.user_id == user.id,
                ExternalPatientAccess.patient_id == patient_id,
                ExternalPatientAccess.revoked_at.is_(None),
            )
        )
        return grant is not None

    return False


def get_org_patient_ids(db: Session, org_ids: list[int]) -> set[str]:
    """Return all patient IDs across the given organisations."""
    if not org_ids:
        return set()
    rows = db.execute(
        select(organisation_patient_member.c.patient_id).where(
            organisation_patient_member.c.organisation_id.in_(org_ids)
        )
    ).all()
    return {r[0] for r in rows}


def get_org_staff_ids(db: Session, org_ids: list[int]) -> set[int]:
    """Return all staff user IDs across the given organisations."""
    if not org_ids:
        return set()
    rows = db.execute(
        select(organisation_staff_member.c.user_id).where(
            organisation_staff_member.c.organisation_id.in_(org_ids)
        )
    ).all()
    return {r[0] for r in rows}


def get_accessible_patient_ids(db: Session, user: User) -> set[str]:
    """Return all patient IDs a user can access (via orgs or external grants).

    All users — including admin/superadmin — are org-scoped here.
    Admin pages that need an unfiltered list should bypass this function.
    """
    result: set[str] = set()

    # Org-based access
    user_orgs = get_user_org_ids(db, user.id)
    if user_orgs:
        result |= get_org_patient_ids(db, user_orgs)

    # External access grants
    if is_external_user(user.system_permissions):
        rows = db.execute(
            select(ExternalPatientAccess.patient_id).where(
                ExternalPatientAccess.user_id == user.id,
                ExternalPatientAccess.revoked_at.is_(None),
            )
        ).all()
        result |= {r[0] for r in rows}

    return result
