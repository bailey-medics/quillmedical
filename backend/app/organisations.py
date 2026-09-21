"""Organisation access helpers.

Provides functions for querying organisation membership and access
control. Used throughout the application to enforce org-scoped
visibility boundaries.

**Everything here counts in org_unit ids** — an organisation is named by
its own row in the tree, the row every org_unit beneath it walks up to.
That is the id the membership table holds, the id the patient list
holds, and the id the screens put back into URLs. The organisation's own
id is on its way out and nothing here speaks it.

Two questions live here and must not be confused:

- **Membership** — *is this person at this organisation, and as what?*
  :func:`get_member_org_unit_ids`.
- **Reach** — *which organisations can this person get to?* Organisation
  membership reaches the organisation and its sites; site membership
  reaches the organisations that site is linked to.
  :func:`get_reachable_org_unit_ids`.

Reach flows downward. A site member reaching an organisation's teaching
content does not thereby become a member of that organisation, which is
why the two functions exist rather than one.

Both answer in the ids of organisations' own rows, never a ward's: a
membership of a ward is a fact about the ward, and asking for it means
asking about the ward.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    ExternalPatientAccess,
    OrgUnit,
    OrgUnitLink,
    User,
    org_unit_member,
    org_unit_patient_member,
    validate_member_capacity,
)
from app.org_units.relations import relation_grants_reach
from app.org_units.tree import (
    descendant_ids,
    organisation_org_unit_ids,
    root_ids_of,
)

# ------------------------------------------------------------------
# Organisation membership, read from the merged table
# ------------------------------------------------------------------

#: Who is at an organisation, and in what capacity — the membership
#: table, narrowed to the rows naming an organisation's own org_unit.
#:
#: A membership of a ward is not in here; that is a membership of the
#: ward, and asking for it means asking about the ward. Reading
#: ``org_unit_member`` directly would answer both at once, which is the
#: distinction every admin check in the application rests on.
#:
#: It is a query rather than a table, so nothing can insert into it.
#: Every write goes through the three functions at the foot of this
#: module.
organisation_org_unit_member = (
    select(
        org_unit_member.c.org_unit_id.label("org_unit_id"),
        org_unit_member.c.user_id.label("user_id"),
        org_unit_member.c.capacity.label("capacity"),
    )
    .where(org_unit_member.c.org_unit_id.in_(organisation_org_unit_ids()))
    .subquery("organisation_org_unit_member")
)


def organisation_org_units_of(
    db: Session, org_unit_ids: list[int]
) -> set[int]:
    """Return the organisation's own org_unit above each of *org_unit_ids*.

    The replacement for "which organisation is accountable here",
    answered in the same id space as the question. An org_unit is its own
    root, so an organisation's row answers itself.

    A root that no organisation stands for contributes nothing rather
    than itself. Such an org_unit is detached from every tree — the test
    fixtures make one deliberately — and treating it as an organisation
    would give its members the run of an org_unit nobody is accountable for.

    Args:
        db: Core database session.
        org_unit_ids: The org_units to resolve.

    Returns:
        The org_units of the organisations above them.
    """
    if not org_unit_ids:
        return set()

    roots = set(root_ids_of(db, org_unit_ids).values())
    if not roots:
        return set()

    return {
        int(org_unit_id)
        for org_unit_id in db.execute(
            organisation_org_unit_ids().where(OrgUnit.id.in_(roots))
        )
        .scalars()
        .all()
    }


def get_member_org_unit_ids(
    db: Session, user_id: int, *, capacity: str | None = None
) -> list[int]:
    """Return the organisations' org_units where the user holds a membership.

    This is *direct* organisation membership only. It does not walk the
    site linkage, because reach flows downward: an organisation member
    reaches its sites, but a site member does not reach up into the
    organisation. A membership of a ward is not one of these.

    Args:
        db: Core database session.
        user_id: The user to resolve.
        capacity: When given, only rows of that capacity count. Pass
            ``"staff"`` to ask *what kind of member*, which is the question
            most access checks are really asking.

    Returns:
        org_unit IDs, ascending.
    """
    stmt = select(organisation_org_unit_member.c.org_unit_id).where(
        organisation_org_unit_member.c.user_id == user_id
    )
    if capacity is not None:
        stmt = stmt.where(
            organisation_org_unit_member.c.capacity
            == validate_member_capacity(capacity)
        )
    return sorted({int(r[0]) for r in db.execute(stmt).all()})


def org_units_administered_by(db: Session, user: User) -> set[int] | None:
    """Return the org_units *user* may administer, or None for all of them.

    An admin administers the organisations they belong to and everything
    beneath them, at any depth. An operator gets None rather than a set
    holding every id in the table, because "all of them" and "these
    thousands" are different answers and only the first stays true as
    the table grows.

    Reach is deliberately not part of this. Reach is why somebody sees
    teaching content at an org_unit they visit; it is not authority over that
    org_unit.

    Args:
        db: Core database session.
        user: The caller.

    Returns:
        The org_unit ids, or None for an operator.
    """
    if user.platform_role == "superadmin":
        return None

    roots = get_member_org_unit_ids(db, user.id)
    return set(roots) | descendant_ids(db, roots)


def get_reachable_org_unit_ids(
    db: Session, user_id: int, *, capacity: str | None = None
) -> list[int]:
    """Return the organisations' org_units the user can reach, by any membership.

    One resolver, replacing two that disagreed. Membership of an org_unit
    reaches the organisation accountable for it, because content is
    delivered downward and a trainee on a ward receives what the trust
    made available there.

    **A teaching link reaches further.** A medical school teaching on a
    trust's wards is a relationship and not ownership, so it is a link
    rather than a parent — and the point of recording it is that people at
    the school can then reach the trust's teaching content. Which
    relations do that is declared beside them in
    ``app/org_units/relations.py``; today only ``teaches_at`` does.

    **Reach is not membership and is not authority.** Nothing here makes
    anybody a member of anything, and nothing here lets them administer
    it: the admin checks ask :func:`get_member_org_unit_ids`, which does not
    follow links. That separation is the whole reason the two functions
    exist rather than one.

    Prefer :func:`get_member_org_unit_ids` where the question is *is this
    person a member of this organisation* rather than *can they reach
    it*.

    Args:
        db: Core database session.
        user_id: The user to resolve.
        capacity: When given, only memberships of that capacity count, at
            every kind of org_unit alike.

    Returns:
        org_unit IDs, ascending.
    """
    # Which org_units the user belongs to, then the root each of them walks
    # up to. Walking rather than joining on a column, because an org_unit
    # several levels down still reaches its organisation and a join on
    # the parent would not see it.
    member_org_units = select(org_unit_member.c.org_unit_id).where(
        org_unit_member.c.user_id == user_id
    )
    if capacity is not None:
        member_org_units = member_org_units.where(
            org_unit_member.c.capacity == validate_member_capacity(capacity)
        )

    org_unit_ids = [int(r[0]) for r in db.execute(member_org_units).all()]
    if not org_unit_ids:
        return []

    roots = organisation_org_units_of(db, org_unit_ids)

    own_org_units = set(org_unit_ids) | roots
    return sorted(roots | _reached_through_links(db, own_org_units))


def _reached_through_links(db: Session, place_ids: set[int]) -> set[int]:
    """Return the organisations' org_units reached from *place_ids* by a link.

    Only links pointing *away* from an org_unit the person is actually at,
    and only relations that say they grant reach. Two limits, both
    deliberate:

    - **A link is a claim its source makes about itself** — "we teach
      there" — so following it the other way would let anybody name a
      school and be let into it.
    - **A link belongs to the org_unit that made it**, not to everything
      above it. One ward recording a relationship must not quietly open it
      to everybody at the trust, which is a wider promise than the ward
      made. An organisation that means it for all of its people records
      the link on itself.

    One hop, too. Reach that chained would make "who can see this" depend
    on a path nobody drew, which is the ambiguity the single parent exists
    to remove.

    Args:
        db: Core database session.
        place_ids: org_units the person is at, and the roots they reach.

    Returns:
        The org_units of organisations reached through a link, if any.
    """
    if not place_ids:
        return set()

    targets = {
        int(target_id)
        for target_id, relation in db.execute(
            select(OrgUnitLink.target_id, OrgUnitLink.relation).where(
                OrgUnitLink.source_id.in_(place_ids)
            )
        ).all()
        if relation_grants_reach(str(relation))
    }
    if not targets:
        return set()

    return organisation_org_units_of(db, sorted(targets))


def get_patient_org_unit_ids(db: Session, patient_id: str) -> list[int]:
    """Return the organisations' org_units the patient belongs to."""
    return sorted(
        int(org_unit_id)
        for org_unit_id in db.execute(
            select(org_unit_patient_member.c.org_unit_id).where(
                org_unit_patient_member.c.patient_id == patient_id,
                org_unit_patient_member.c.org_unit_id.in_(
                    organisation_org_unit_ids()
                ),
            )
        )
        .scalars()
        .all()
    )


def get_shared_org_unit_ids(
    db: Session, user_id: int, patient_id: str
) -> list[int]:
    """Return the org_units shared between a staff user and a patient."""
    user_org_units = set(get_member_org_unit_ids(db, user_id))
    patient_org_units = set(get_patient_org_unit_ids(db, patient_id))
    return sorted(user_org_units & patient_org_units)


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
        if get_shared_org_unit_ids(db, user.id, patient_id):
            return True

    return False


def get_org_unit_patient_ids(db: Session, org_unit_ids: list[int]) -> set[str]:
    """Return all patient IDs across the given org_units."""
    if not org_unit_ids:
        return set()
    rows = db.execute(
        select(org_unit_patient_member.c.patient_id).where(
            org_unit_patient_member.c.org_unit_id.in_(org_unit_ids)
        )
    ).all()
    return {r[0] for r in rows}


def get_org_unit_member_ids(
    db: Session, org_unit_ids: list[int], *, capacity: str | None = None
) -> set[int]:
    """Return user IDs who are members of the given organisations' org_units.

    Args:
        db: Core database session.
        org_unit_ids: The org_units to look in. An empty list returns nothing
            rather than everything, so a caller that resolved to no
            org_unit cannot accidentally see the whole estate.
        capacity: When given, only members of that capacity are returned.

    Returns:
        The matching user IDs.
    """
    if not org_unit_ids:
        return set()
    stmt = select(organisation_org_unit_member.c.user_id).where(
        organisation_org_unit_member.c.org_unit_id.in_(org_unit_ids)
    )
    if capacity is not None:
        stmt = stmt.where(
            organisation_org_unit_member.c.capacity
            == validate_member_capacity(capacity)
        )
    return {int(r[0]) for r in db.execute(stmt).all()}


def get_org_unit_staff_ids(db: Session, org_unit_ids: list[int]) -> set[int]:
    """Return every member of the given org_units, in any capacity.

    Deprecated in favour of :func:`get_org_unit_member_ids`, which makes the
    capacity explicit. The name says staff and the behaviour never was —
    once registration began writing trainees into the same table this
    returned them too.

    Kept returning everyone, deliberately. Narrowing it here would change
    what every existing caller means in one edit, and at least one of them
    (admin user listing) genuinely wants everybody at the org_unit.
    Callers that mean staff should say
    ``get_org_unit_member_ids(db, org_unit_ids, capacity="staff")``.
    """
    return get_org_unit_member_ids(db, org_unit_ids)


def get_accessible_patient_ids(db: Session, user: User) -> set[str]:
    """Return all patient IDs a user can access (via orgs or external grants).

    All users — including admin/superadmin — are org-scoped here.
    Admin pages that need an unfiltered list should bypass this function.
    """
    result: set[str] = set()

    # Org-based access
    user_org_units = get_member_org_unit_ids(db, user.id)
    if user_org_units:
        result |= get_org_unit_patient_ids(db, user_org_units)

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
    # fact about the same person, and are now one table keyed on an org_unit in
    # the tree. An organisation's org_unit is its own row — its root.
    #
    # These three functions are the only code that writes an organisation
    # membership. They were what made switching every reader over a change in
    # one file rather than a hunt through the routes.


def media_prefix_of(db: Session, org_unit_id: int) -> int | None:
    """Return the number this org_unit's media objects are filed under.

    Media lives at ``{prefix}/{module}/{asset}`` in a bucket and the
    signed cookie covers that path, so every object of one module at one
    org_unit has to share a prefix. That number was the organisation's own
    id; ``org_unit.media_prefix_id`` records it, so the objects already
    written stay addressable once the organisations table is gone.

    An org_unit with nothing recorded files under its own id — which is what
    an org_unit created from here onwards does, there being no second number
    for it to have.

    Args:
        db: Core database session.
        org_unit_id: The org_unit.

    Returns:
        The prefix, or None if there is no such org_unit.
    """
    row = db.execute(
        select(OrgUnit.id, OrgUnit.media_prefix_id).where(
            OrgUnit.id == org_unit_id
        )
    ).first()
    if row is None:
        return None
    own_id, recorded = row
    return int(recorded) if recorded is not None else int(own_id)


def add_org_unit_member(
    db: Session,
    org_unit_id: int,
    user_id: int,
    capacity: str,
) -> None:
    """Record that somebody is at an org_unit, in a given capacity.

    Writing the same membership twice changes the capacity rather than
    failing, so a caller that has already checked and one that has not
    both end up with one row saying the same thing.

    Named for an org_unit rather than an organisation because that is what
    the table has always held: the translation this used to do at the
    top was the last thing making it look otherwise.

    Args:
        db: Core database session. The caller commits.
        org_unit_id: The org_unit they are at.
        user_id: The person.
        capacity: One of ``MEMBER_CAPACITIES``.
    """
    capacity = validate_member_capacity(capacity)

    existing = db.scalar(
        select(org_unit_member.c.user_id).where(
            org_unit_member.c.org_unit_id == org_unit_id,
            org_unit_member.c.user_id == user_id,
        )
    )
    if existing is None:
        db.execute(
            org_unit_member.insert().values(
                org_unit_id=org_unit_id,
                user_id=user_id,
                capacity=capacity,
            )
        )
    else:
        db.execute(
            org_unit_member.update()
            .where(
                org_unit_member.c.org_unit_id == org_unit_id,
                org_unit_member.c.user_id == user_id,
            )
            .values(capacity=capacity)
        )


def remove_org_unit_member(
    db: Session, org_unit_id: int, user_id: int
) -> None:
    """Remove one person's membership of one org_unit.

    Args:
        db: Core database session. The caller commits.
        org_unit_id: The org_unit.
        user_id: The person.
    """
    db.execute(
        org_unit_member.delete().where(
            org_unit_member.c.org_unit_id == org_unit_id,
            org_unit_member.c.user_id == user_id,
        )
    )


def remove_org_unit_memberships(
    db: Session,
    user_id: int,
    org_unit_ids: list[int] | None = None,
) -> None:
    """Remove a person's memberships of organisations.

    Removes every one of them when *org_unit_ids* is None, which is what a
    superadmin replacing somebody's memberships wants. An admin passes
    the org_units they are entitled to act on, so the edit cannot reach a
    membership they cannot see.

    Only memberships *of organisations* go, even when a ward is named: a
    membership of a ward is a different fact about a different org_unit,
    and an admin editing which trusts somebody belongs to should not
    silently take them off a ward.

    Args:
        db: Core database session. The caller commits.
        user_id: The person.
        org_unit_ids: Which org_units to clear, or None for every organisation.
    """
    roots = organisation_org_unit_ids()
    if org_unit_ids is not None:
        roots = roots.where(OrgUnit.id.in_(org_unit_ids))
    root_ids = list(db.execute(roots).scalars().all())

    if root_ids:
        db.execute(
            org_unit_member.delete().where(
                org_unit_member.c.user_id == user_id,
                org_unit_member.c.org_unit_id.in_(root_ids),
            )
        )
