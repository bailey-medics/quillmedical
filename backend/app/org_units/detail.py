"""What one org unit's own page shows, and to whom.

One org unit with what is inside it, read for the caller asking. What
their competencies do not cover is left out here, where the reading is
done, so that no page can show it by forgetting to hide it.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.positions import clinical_leads_of
from app.models import (
    DELETED_ACCOUNT_NAME,
    OrgUnit,
    OrgUnitFeature,
    User,
    org_unit_patient_member,
)
from app.org_units.access import require_visible


@dataclass(frozen=True)
class OrgUnitDetail:
    """One org_unit, as much of it as the caller may see.

    Attributes:
        unit: The org_unit.
        parent: The org_unit it sits inside, or None at the top of a
            tree.
        children: The org_units directly inside it, by name.
        child_leads: The id of each child to the user id of its clinical
            lead. A child whose post is vacant is absent.
        lead_names: The user id of each of those leads to a readable
            name.
        features: The keys of the features switched on here, in order.
            Empty for a caller without ``manage_users``.
        patient_ids: The patients it is responsible for, in order. Empty
            for a caller with neither ``manage_users`` nor
            ``manage_patient_membership``.
        clinical_lead_id: Who holds its own clinical lead post, or None
            when it is vacant.
    """

    unit: OrgUnit
    parent: OrgUnit | None
    children: list[OrgUnit]
    child_leads: dict[int, int]
    lead_names: dict[int, str]
    features: list[str]
    patient_ids: list[str]
    clinical_lead_id: int | None


def names_of(db: Session, user_ids: set[int]) -> dict[int, str]:
    """Return a readable name for each of *user_ids*.

    Resolved in one query so a list of org_units does not cost one request
    per row to say who leads it.
    """
    if not user_ids:
        return {}

    return {
        row.id: (
            DELETED_ACCOUNT_NAME
            if row.emptied_at is not None
            else row.full_name or row.username
        )
        for row in db.execute(
            select(
                User.id, User.full_name, User.username, User.emptied_at
            ).where(User.id.in_(user_ids))
        ).all()
    }


def org_unit_detail(db: Session, caller: User, unit_id: int) -> OrgUnitDetail:
    """Read one org_unit for *caller*, with what is inside it.

    A caller with ``manage_users`` sees all of it. One who reaches it
    through a scoped manager sees an org_unit they belong to, or one
    beneath it. The detail then leaves out what the caller's
    competencies do not cover, rather than the page hiding it, so a
    section added to the page later cannot show patients by forgetting
    to hide itself: features need ``manage_users``, and the patient list
    ``manage_users`` or ``manage_patient_membership``. Left out means
    empty, so the shape of the answer does not change.

    Its members are not read here: the member list is its own answer,
    and the route that builds this one asks for it.

    Args:
        db: Core database session.
        caller: Who is asking.
        unit_id: The org_unit.

    Returns:
        The org_unit and what the caller may see of it.

    Raises:
        OrgUnitNotFound: If no org_unit has that id, or one does that
            the caller may not see.
    """
    unit = require_visible(db, caller, unit_id, "manage_users")
    held = set(caller.get_final_competencies())
    sees_features = "manage_users" in held
    sees_patients = bool(held & {"manage_users", "manage_patient_membership"})

    children = list(
        db.execute(
            select(OrgUnit)
            .where(OrgUnit.parent_id == unit_id)
            .order_by(OrgUnit.name)
        )
        .scalars()
        .all()
    )
    child_leads = clinical_leads_of(db, [child.id for child in children])
    lead_names = names_of(db, set(child_leads.values()))

    features: list[str] = []
    patient_ids: list[str] = []

    if sees_features:
        features = list(
            db.execute(
                select(OrgUnitFeature.feature_key)
                .where(OrgUnitFeature.org_unit_id == unit_id)
                .order_by(OrgUnitFeature.feature_key)
            )
            .scalars()
            .all()
        )
    if sees_patients:
        patient_ids = list(
            db.execute(
                select(org_unit_patient_member.c.patient_id)
                .where(org_unit_patient_member.c.org_unit_id == unit_id)
                .order_by(org_unit_patient_member.c.patient_id)
            )
            .scalars()
            .all()
        )

    parent: OrgUnit | None = None

    if unit.parent_id is not None:
        parent = db.get(OrgUnit, unit.parent_id)

    return OrgUnitDetail(
        unit=unit,
        parent=parent,
        children=children,
        child_leads=child_leads,
        lead_names=lead_names,
        features=features,
        patient_ids=patient_ids,
        clinical_lead_id=clinical_leads_of(db, [unit_id]).get(unit_id),
    )
