"""Which people a caller is shown, and what is said about each.

The user list answers two different questions through one route.

Asked about a patient, it is the message participant picker: everybody
at the patient's organisations, and anybody outside them who has been
given access to that patient. Only somebody whose authority to grant
has no limit may ask.

Asked about nobody, it is the admin list: everybody the caller may
open, which for an operator is everyone and for anybody else is the
members of the org units they belong to and of everything beneath
those.

Who may list people at all is the route's question, as it is for every
people route. These functions refuse nobody on that ground.

Neither list is put in an order: each comes back as the database gives
it.
"""

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.grant_scope import scope_for
from app.models import ExternalPatientAccess, OrgUnit, User, org_unit_member
from app.organisations import (
    get_org_unit_staff_ids,
    get_patient_org_unit_ids,
    org_units_whose_people_reached_by,
    organisation_org_unit_member,
)
from app.schemas.auth import UserSummaryItem
from app.users.errors import PatientPickerNotAllowed


def people_around_a_patient(
    db: Session, actor: User, patient_id: str
) -> Sequence[User]:
    """Who may be added to a conversation about a patient.

    Every member, in any capacity, of the organisations the patient
    belongs to, and every person outside them whose access to this
    patient has not been revoked. The caller's own org units are not
    asked about.

    Args:
        db: Core database session.
        actor: The caller.
        patient_id: The FHIR id of the patient.

    Returns:
        The people, or nobody where the patient belongs nowhere and
        nobody has been given access.

    Raises:
        PatientPickerNotAllowed: If the caller's scope has a limit.
    """
    # The message participant picker, which is about a patient and
    # nothing to do with teaching, so a limited scope does not reach it.
    if not scope_for(actor).unlimited:
        raise PatientPickerNotAllowed()

    # Filtered mode: staff in patient's orgs + external with access
    patient_orgs = get_patient_org_unit_ids(db, patient_id)
    staff_ids = (
        get_org_unit_staff_ids(db, patient_orgs) if patient_orgs else set()
    )

    # Also include external users with active access to this patient
    external_rows = db.execute(
        select(ExternalPatientAccess.user_id).where(
            ExternalPatientAccess.patient_id == patient_id,
            ExternalPatientAccess.revoked_at.is_(None),
        )
    ).all()
    external_ids = {r[0] for r in external_rows}

    all_ids = staff_ids | external_ids

    if not all_ids:
        return []

    return (
        db.execute(select(User).where(User.id.in_(all_ids)))
        .scalars()
        .unique()
        .all()
    )


def picker_rows(people: Sequence[User]) -> list[UserSummaryItem]:
    """What the participant picker is told about each person.

    Less than the admin list says: no name, and nothing of where they
    belong.
    """
    return [
        UserSummaryItem(
            id=user.id,
            username=user.username,
            email=user.email,
            platform_role=user.platform_role,
            competencies=user.get_final_competencies(),
            is_active=user.is_active,
        )
        for user in people
    ]


def people_within_reach(db: Session, actor: User) -> set[int] | None:
    """The people the caller may be shown in the admin list, or None for all.

    Anyone but an operator sees only users at their own org_units;
    operators see everyone.

    An operator who belongs to one of those org_units is among them
    with everybody else. They were filtered out here, while the
    org_unit's own staff table went on naming them, so an admin saw a
    colleague on one page and not the other. Seeing is all it is: every
    route that changes an account still refuses a non-operator acting
    on an operator.

    Args:
        db: Core database session.
        actor: The caller.

    Returns:
        The ids of the people, which is empty for somebody who belongs
        nowhere, or None for an operator.
    """
    if actor.platform_role == "superadmin":
        return None

    # Everybody at an org_unit the admin belongs to, or at one
    # beneath it: the same reach the routes acting on one user
    # check, so nobody is listed who cannot then be opened.
    reached = org_units_whose_people_reached_by(db, actor)

    if not reached:
        return set()

    return {
        row[0]
        for row in db.execute(
            select(org_unit_member.c.user_id).where(
                org_unit_member.c.org_unit_id.in_(reached)
            )
        ).all()
    }


def people_to_list(
    db: Session,
    within: set[int] | None,
    *,
    exclude_org_unit: int | None,
) -> Sequence[User]:
    """The people of the admin list, less the members of one org unit.

    Args:
        db: Core database session.
        within: The ids :func:`people_within_reach` gave, or None for
            everybody.
        exclude_org_unit: An org unit whose members, in any capacity,
            are left out, or None to leave nobody out. It is not
            checked against the caller's reach, and an id no org unit
            has leaves nobody out.

    Returns:
        The people. Nobody, without asking the database, where *within*
        is empty.
    """
    if within is not None and not within:
        return []

    # An emptied account is nobody: it is never listed or picked.
    stmt = select(User).where(User.emptied_at.is_(None))

    # Exclude people who are already members of the org_unit being
    # added to. A caller sending nothing excludes nobody.
    if exclude_org_unit is not None:
        stmt = stmt.where(
            User.id.notin_(
                select(org_unit_member.c.user_id).where(
                    org_unit_member.c.org_unit_id == exclude_org_unit
                )
            )
        )

    if within is not None:
        stmt = stmt.where(User.id.in_(within))

    return db.execute(stmt).scalars().unique().all()


def admin_rows(db: Session, people: Sequence[User]) -> list[UserSummaryItem]:
    """What the admin list says about each person, with where they belong.

    ``organisations`` names the organisations they are a member of.
    ``sites`` names every org unit they are a member of, organisations
    among them, whatever its type.

    Args:
        db: Core database session.
        people: The people to describe.

    Returns:
        One row for each person, in the order given.
    """
    # Batch-load organisation and site memberships
    user_ids = [user.id for user in people]
    # Joined on the org_unit, which is what the membership row holds.
    # This read ``Organisation.id == ...org_unit_id`` for a release:
    # an organisation id compared against an org_unit id, which matches
    # on a small installation because the two sequences agree, and
    # stops matching the moment a ward is created between two
    # organisations. A user's organisations then came back empty, or
    # named somebody else's.
    org_rows = db.execute(
        select(
            organisation_org_unit_member.c.user_id,
            OrgUnit.name,
        )
        .join(
            OrgUnit,
            OrgUnit.id == organisation_org_unit_member.c.org_unit_id,
        )
        .where(organisation_org_unit_member.c.user_id.in_(user_ids))
    ).all()
    user_orgs: dict[int, list[str]] = {}

    for row in org_rows:
        user_orgs.setdefault(row[0], []).append(row[1])

    site_rows = db.execute(
        select(
            org_unit_member.c.user_id,
            OrgUnit.name,
        )
        .join(
            OrgUnit,
            OrgUnit.id == org_unit_member.c.org_unit_id,
        )
        .where(org_unit_member.c.user_id.in_(user_ids))
    ).all()
    user_sites: dict[int, list[str]] = {}

    for row in site_rows:
        user_sites.setdefault(row[0], []).append(row[1])

    return [
        UserSummaryItem(
            id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name or "",
            platform_role=user.platform_role,
            competencies=user.get_final_competencies(),
            is_active=user.is_active,
            organisations=user_orgs.get(user.id, []),
            sites=user_sites.get(user.id, []),
        )
        for user in people
    ]
