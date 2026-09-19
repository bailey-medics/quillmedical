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
    Organisation,
    User,
    org_unit_member,
    org_unit_patient_member,
    validate_member_capacity,
)
from app.org_units.tree import (
    organisation_ids_of_sites,
    root_ids_of_organisations,
)

# ------------------------------------------------------------------
# Organisation membership, read from the merged table
# ------------------------------------------------------------------

#: Who is at an organisation, and in what capacity — the same three
#: columns the separate table used to hold, now read from the one
#: membership table by way of each organisation's own row in the tree.
#:
#: Kept under the name the call sites already used, because what they ask
#: has not changed: only where the answer comes from. A membership of a
#: ward is not in here; that is a membership of the ward, and asking for
#: it means asking about the ward.
#:
#: It is a query rather than a table, so nothing can insert into it. Every
#: write goes through the three functions above, which is what made
#: switching the reads a change in one file.
organisation_member = (
    select(
        Organisation.id.label("organisation_id"),
        org_unit_member.c.user_id.label("user_id"),
        org_unit_member.c.capacity.label("capacity"),
    )
    .join(
        org_unit_member,
        org_unit_member.c.org_unit_id == Organisation.org_unit_id,
    )
    .subquery("organisation_member")
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
    # Which places the user belongs to, then which organisation is
    # accountable for each. Resolved by walking the tree up rather than by
    # joining on a column, because a place several levels down still
    # reaches its organisation and a join on the parent would not see it.
    member_sites = select(org_unit_member.c.org_unit_id).where(
        org_unit_member.c.user_id == user_id
    )
    if capacity is not None:
        member_sites = member_sites.where(
            org_unit_member.c.capacity == validate_member_capacity(capacity)
        )

    site_ids = [int(r[0]) for r in db.execute(member_sites).all()]

    direct = get_member_org_ids(db, user_id, capacity=capacity)
    reached = set(organisation_ids_of_sites(db, site_ids).values())
    return sorted(set(direct) | reached)


def get_user_org_ids(db: Session, user_id: int) -> list[int]:
    """Return organisation IDs the user belongs to, in any capacity.

    **Nothing calls this any more.** It was retained as the name 20-odd
    call sites already used, while they said neither *membership* nor
    *reach* out loud; all of them now say :func:`get_member_org_ids`
    directly, and teaching's own wrapper says :func:`get_reachable_org_ids`.

    Left in place rather than deleted in the same change as the walk, so
    that the walk is reviewable as a rename and nothing else. Deleting it
    is a one-line follow-up once that has landed.

    It answers direct membership without regard to capacity, which is what
    it has always done — an older docstring said "as staff", and that was
    never true once registration began writing trainees into the same
    table.
    """
    return get_member_org_ids(db, user_id)


def get_patient_org_ids(db: Session, patient_id: str) -> list[int]:
    """Return organisation IDs the patient belongs to."""
    place_ids = [
        int(r[0])
        for r in db.execute(
            select(org_unit_patient_member.c.org_unit_id).where(
                org_unit_patient_member.c.patient_id == patient_id
            )
        ).all()
    ]
    if not place_ids:
        return []
    return sorted(
        int(org_id)
        for org_id in db.execute(
            select(Organisation.id).where(
                Organisation.org_unit_id.in_(place_ids)
            )
        )
        .scalars()
        .all()
    )


def get_shared_org_ids(
    db: Session, user_id: int, patient_id: str
) -> list[int]:
    """Return organisation IDs shared between a staff user and a patient."""
    user_orgs = set(get_member_org_ids(db, user_id))
    patient_orgs = set(get_patient_org_ids(db, patient_id))
    return sorted(user_orgs & patient_orgs)


def check_user_patient_access(
    db: Session, user: User, patient_id: str
) -> bool:
    """Check whether *user* may access *patient_id*.

    Three routes reach a record, and each pairs a competency saying
    *what* with a scope saying *which*:

    - ``access_own_patient_records`` and the account's own patient link
    - ``access_granted_patient_records`` and an ExternalPatientAccess
      grant naming this patient
    - ``access_patient_records`` and a shared organisation

    **The rank hatch this used to open with is gone.** Its first line
    returned ``True`` for any ``admin`` or ``superadmin`` — "always True
    for admin pages" — so an operator who shared no organisation with a
    patient could still reach them. That is the conflation the platform
    role work exists to undo: a rank said *what* someone is and was read
    as *where* they may act.

    The competency answers *what* and the shared organisation answers
    *where*, and both are required. A superadmin is not thereby a
    clinician: ``superadmin_profession`` grants ``manage_users`` alone,
    so operating Quill confers no access to a record here.

    Args:
        db: Core database session.
        user: The person asking.
        patient_id: FHIR Patient resource ID being reached for.

    Returns:
        True if they may access the patient, False otherwise.
    """
    competencies = user.get_final_competencies()

    # Their own record. The patient link is the scope: it names exactly
    # one record, so there is nothing further to check.
    if (
        "access_own_patient_records" in competencies
        and user.fhir_patient_id
        and user.fhir_patient_id == patient_id
    ):
        return True

        # A record they were invited to. The grant row names which patient,
        # exactly as organisation membership does below; without the pairing
        # revoking a competency could not cut access, only deleting the row
        # could.
    if "access_granted_patient_records" in competencies:
        grant = db.scalar(
            select(ExternalPatientAccess).where(
                ExternalPatientAccess.user_id == user.id,
                ExternalPatientAccess.patient_id == patient_id,
                ExternalPatientAccess.revoked_at.is_(None),
            )
        )
        if grant is not None:
            return True

            # A patient they are treating. Membership alone is not enough:
            # sharing an organisation says only that the patient is in reach,
            # never that this person may read them.
    if "access_patient_records" in competencies:
        if get_shared_org_ids(db, user.id, patient_id):
            return True

    return False


def get_org_patient_ids(db: Session, org_ids: list[int]) -> set[str]:
    """Return all patient IDs across the given organisations."""
    if not org_ids:
        return set()
    rows = db.execute(
        select(org_unit_patient_member.c.patient_id).where(
            org_unit_patient_member.c.org_unit_id.in_(
                root_ids_of_organisations(db, org_ids)
            )
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
    user_orgs = get_member_org_ids(db, user.id)
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

    # ------------------------------------------------------------------
    # Writing membership
    # ------------------------------------------------------------------
    #
    # Membership at an organisation and membership at a ward are the same
    # fact about the same person, and are now one table keyed on a place in
    # the tree. An organisation's place is its own row — its root.
    #
    # These three functions are the only code that writes an organisation
    # membership. They were what made switching every reader over a change in
    # one file rather than a hunt through the routes.


def _root_of(db: Session, organisation_id: int) -> int | None:
    """Return the tree row an organisation stands for, if it has one."""
    roots = root_ids_of_organisations(db, [organisation_id])
    return roots[0] if roots else None


def add_organisation_member(
    db: Session,
    organisation_id: int,
    user_id: int,
    capacity: str,
) -> None:
    """Record that somebody is at an organisation, in a given capacity.

    Writing the same membership twice changes the capacity rather than
    failing, so a caller that has already checked and one that has not
    both end up with one row saying the same thing.

    Args:
        db: Core database session. The caller commits.
        organisation_id: The organisation they are at.
        user_id: The person.
        capacity: One of ``MEMBER_CAPACITIES``.
    """
    capacity = validate_member_capacity(capacity)

    root_id = _root_of(db, organisation_id)
    if root_id is None:
        return

    existing = db.scalar(
        select(org_unit_member.c.user_id).where(
            org_unit_member.c.org_unit_id == root_id,
            org_unit_member.c.user_id == user_id,
        )
    )
    if existing is None:
        db.execute(
            org_unit_member.insert().values(
                org_unit_id=root_id,
                user_id=user_id,
                capacity=capacity,
            )
        )
    else:
        db.execute(
            org_unit_member.update()
            .where(
                org_unit_member.c.org_unit_id == root_id,
                org_unit_member.c.user_id == user_id,
            )
            .values(capacity=capacity)
        )


def remove_organisation_member(
    db: Session, organisation_id: int, user_id: int
) -> None:
    """Remove one person's membership of one organisation.

    Args:
        db: Core database session. The caller commits.
        organisation_id: The organisation.
        user_id: The person.
    """
    root_id = _root_of(db, organisation_id)
    if root_id is None:
        return
    db.execute(
        org_unit_member.delete().where(
            org_unit_member.c.org_unit_id == root_id,
            org_unit_member.c.user_id == user_id,
        )
    )


def remove_organisation_memberships(
    db: Session,
    user_id: int,
    organisation_ids: list[int] | None = None,
) -> None:
    """Remove a person's organisation memberships.

    Removes every one of them when *organisation_ids* is None, which is
    what a superadmin replacing somebody's memberships wants. An admin
    passes the organisations they are entitled to act on, so the edit
    cannot reach a membership they cannot see.

    Only memberships *of organisations* go: a membership of a ward is a
    different fact about a different place, and an admin editing which
    trusts somebody belongs to should not silently take them off a ward.

    Args:
        db: Core database session. The caller commits.
        user_id: The person.
        organisation_ids: Which organisations to clear, or None for all.
    """
    if organisation_ids is None:
        root_ids = [
            root_id
            for root_id in db.execute(
                select(Organisation.org_unit_id).where(
                    Organisation.org_unit_id.is_not(None)
                )
            )
            .scalars()
            .all()
            if root_id is not None
        ]
    else:
        root_ids = root_ids_of_organisations(db, organisation_ids)

    if root_ids:
        db.execute(
            org_unit_member.delete().where(
                org_unit_member.c.user_id == user_id,
                org_unit_member.c.org_unit_id.in_(root_ids),
            )
        )
