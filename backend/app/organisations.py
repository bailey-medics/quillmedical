"""Organisation access helpers.

Provides functions for querying organisation membership and access
control. Used throughout the application to enforce org-scoped
visibility boundaries.

Two questions live here and must not be confused:

- **Membership** — *is this person at this organisation, and as what?*
  :func:`get_member_org_ids`.
- **Reach** — *which organisations can this person get to?* Organisation
  membership reaches the organisation and its sites; site membership
  reaches the organisations that site is linked to.
  :func:`get_reachable_org_ids`.

Reach flows downward. A site member reaching an organisation's teaching
content does not thereby become a member of that organisation, which is
why the two functions exist rather than one.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    ExternalPatientAccess,
    User,
    organisation_member,
    organisation_patient_member,
    organisation_site,
    site_member,
    validate_member_capacity,
)


def get_member_org_ids(
    db: Session, user_id: int, *, capacity: str | None = None
) -> list[int]:
    """Return organisation IDs where the user holds a membership row.

    This is *direct* organisation membership only. It does not walk the
    site linkage, because reach flows downward: an organisation member
    reaches its sites, but a site member does not reach up into the
    organisation.

    Args:
        db: Core database session.
        user_id: The user to resolve.
        capacity: When given, only rows of that capacity count. Pass
            ``"staff"`` to ask *what kind of member*, which is the question
            most access checks are really asking.

    Returns:
        Organisation IDs, ascending.
    """
    stmt = select(organisation_member.c.organisation_id).where(
        organisation_member.c.user_id == user_id
    )
    if capacity is not None:
        stmt = stmt.where(
            organisation_member.c.capacity
            == validate_member_capacity(capacity)
        )
    return sorted({int(r[0]) for r in db.execute(stmt).all()})


def get_reachable_org_ids(
    db: Session, user_id: int, *, capacity: str | None = None
) -> list[int]:
    """Return organisation IDs the user can reach, by any membership.

    One resolver, replacing two that disagreed. Membership of an
    organisation reaches that organisation; membership of a site reaches
    the organisations that site is linked to, because content is delivered
    downward and a trainee at a site receives what the organisation made
    available there.

    Prefer :func:`get_member_org_ids` where the question is *is this person
    a member of this organisation* rather than *can they reach it*. The
    difference matters: reach is why a site trainee sees teaching content,
    and membership is why they are not thereby staff of the trust.

    Args:
        db: Core database session.
        user_id: The user to resolve.
        capacity: When given, only memberships of that capacity count, at
            the site and the organisation alike.

    Returns:
        Organisation IDs, ascending.
    """
    via_site = (
        select(organisation_site.c.organisation_id)
        .join(
            site_member,
            site_member.c.site_id == organisation_site.c.site_id,
        )
        .where(site_member.c.user_id == user_id)
    )
    if capacity is not None:
        via_site = via_site.where(
            site_member.c.capacity == validate_member_capacity(capacity)
        )

    direct = get_member_org_ids(db, user_id, capacity=capacity)
    reached = {int(r[0]) for r in db.execute(via_site).all()}
    return sorted(set(direct) | reached)


def get_user_org_ids(db: Session, user_id: int) -> list[int]:
    """Return organisation IDs the user belongs to, in any capacity.

    Retained as the name 20-odd call sites already use. It answers direct
    membership without regard to capacity, which is what it has always
    done — the previous docstring said "as staff", and that was never true
    once registration began writing trainees into the same table.

    Call sites that mean staff should say so via
    :func:`get_member_org_ids`.
    """
    return get_member_org_ids(db, user_id)


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
    grant = db.scalar(
        select(ExternalPatientAccess).where(
            ExternalPatientAccess.user_id == user.id,
            ExternalPatientAccess.patient_id == patient_id,
            ExternalPatientAccess.revoked_at.is_(None),
        )
    )
    return grant is not None


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


def get_org_member_ids(
    db: Session, org_ids: list[int], *, capacity: str | None = None
) -> set[int]:
    """Return user IDs who are members of the given organisations.

    Args:
        db: Core database session.
        org_ids: Organisations to look in. An empty list returns nothing
            rather than everything, so a caller that resolved to no
            organisation cannot accidentally see the whole estate.
        capacity: When given, only members of that capacity are returned.

    Returns:
        The matching user IDs.
    """
    if not org_ids:
        return set()
    stmt = select(organisation_member.c.user_id).where(
        organisation_member.c.organisation_id.in_(org_ids)
    )
    if capacity is not None:
        stmt = stmt.where(
            organisation_member.c.capacity
            == validate_member_capacity(capacity)
        )
    return {int(r[0]) for r in db.execute(stmt).all()}


def get_org_staff_ids(db: Session, org_ids: list[int]) -> set[int]:
    """Return every member of the given organisations, in any capacity.

    Deprecated in favour of :func:`get_org_member_ids`, which makes the
    capacity explicit. The name says staff and the behaviour never was —
    once registration began writing trainees into the same table this
    returned them too.

    Kept returning everyone, deliberately. Narrowing it here would change
    what every existing caller means in one edit, and at least one of them
    (admin user listing) genuinely wants everybody at the organisation.
    Callers that mean staff should say
    ``get_org_member_ids(db, org_ids, capacity="staff")``.
    """
    return get_org_member_ids(db, org_ids)


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
    rows = db.execute(
        select(ExternalPatientAccess.patient_id).where(
            ExternalPatientAccess.user_id == user.id,
            ExternalPatientAccess.revoked_at.is_(None),
        )
    ).all()
    result |= {r[0] for r in rows}

    return result
